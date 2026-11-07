"""Exercise Andrew's API workflow against a separate cached team backend.

No production data is used. The synthetic Harbor fixture has the specified 142
missing payments and nett sum, plus one linked payment in a different outlet.
Run with a Python environment containing the team's backend dependencies.
"""
import json
import sys
from pathlib import Path
from uuid import uuid4

web = Path(__file__).resolve().parents[1]
backend = web / '.verification' / 'team' / 'backend'
sys.path[:0] = [str(backend), str(backend / 'tests')]
from fastapi.testclient import TestClient
from test_matching_engine import ID, WITHDRAWAL, tables
from kira.config import settings
from kira import db
from kira.api.app import create_app
from kira.models import CleanRow, CleaningRules
from kira.services import learning, match, state

settings.database_url = f"sqlite:///{web / '.verification' / ('ui-contract-' + uuid4().hex + '.db')}"
settings.auth_user = 'andrew-test'
settings.auth_password = 'local-ui-test'
settings.secret = 'local-ui-contract-test'
settings.ai = False
settings.deepseek_api_key = ''
settings.ui_dir = web / 'dist'
outlet = 'Zestly Harbor Square Surabaya'
T = tables()
T['pos']['rows'] = []
T['settlement']['rows'] = []
for i in range(142):
    amount = 43094 if i == 141 else 63747
    T['pos']['rows'].append({'sales_number':f'HARBOR-{i+1}', 'trace_number':f'h{i}', 'branch':outlet, 'payment_amount':amount, 'sales_datetime_out':'2026-10-24T12:00:00+07:00'})
    T['settlement']['rows'].append({'reference':f'PAY-{i+1}', 'external_reference_id':f'h{i}', 'entity_id':'69795388', 'transaction_type':'Payment', 'branch':outlet, 'payment_method':'SHOPEEPAY', 'transaction_date':'2026-10-24', 'gross_amount':amount, 'nett_amount':amount})
T['settlement']['rows'].append({'reference':'HARBOR-W1', 'entity_id':'69795388', 'transaction_type':'Withdrawal', 'branch':outlet, 'transaction_date':'2026-10-24', 'nett_amount':-9031421})
T['pos']['rows'].append({'sales_number':'CENTRAL-1', 'trace_number':'c1', 'branch':'Central', 'payment_amount':1000, 'sales_datetime_out':'2026-10-24T12:00:00+07:00'})
T['settlement']['rows'] += [{'reference':'CENTRAL-S1','external_reference_id':'c1','entity_id':'12345678','transaction_type':'Payment','branch':'Central','transaction_date':'2026-10-24','gross_amount':1000,'nett_amount':1000},{'reference':'CENTRAL-W1','entity_id':'12345678','transaction_type':'Withdrawal','transaction_date':'2026-10-24','nett_amount':-1000}]
T['bank']['rows'][0]['tanggal_transaksi'] = '2026-10-27'
db.init_db()
with db.session_scope() as session:
    state.put(session,'conversion',{'stale':False,'proposals':{},'decisions':{}})
    session.add(CleaningRules(version=1,maps={},exclude={},created_by='Andrew test'))
    for area,table in T.items():
        session.add_all([CleanRow(type=area,row_no=i,source_row=i,data=row,was={}) for i,row in enumerate(table['rows'])])
        learning.note(session,'upload',table=area,choice='create')
    for card in ['branch','bank']:learning.note(session,'cleaning',id=card)
    for stage,rule in [('l1',ID),('l2',WITHDRAWAL)]:
        match.save_rule(session,stage,rule['kind'],rule['params'],'Andrew test')
        match.run(session,stage,'Andrew test')

scope={'outlet':outlet,'date_from':'2026-10-24','date_to':'2026-10-24'}
snapshots={}
with TestClient(create_app()) as client:
    assert client.get('/api/overview').status_code == 401
    assert client.post('/api/login',json={'username':'andrew-test','password':'wrong'}).status_code == 401
    assert client.post('/api/login',json={'username':'andrew-test','password':'local-ui-test'}).status_code == 200
    for path in ['/api/overview','/api/learning','/api/analysis/summary','/api/analysis/rates','/api/analysis/gaps','/api/analysis/side/l2/settlement','/api/analysis/side/l2/bank','/api/analysis/follow-ups']:
        response=client.get(path,params=scope)
        assert response.status_code == 200,(path,response.text)
        snapshots[path]=response.json()
    assert snapshots['/api/analysis/rates']['rows'][0]['r_full'] == 0
    settlements=snapshots['/api/analysis/side/l2/settlement']
    assert settlements['total'] == 142
    assert settlements['aggregates']['nett_amount']['sum'] == 9031421
    assert snapshots['/api/analysis/side/l2/bank']['total'] == 0
    assert client.get('/api/analysis/follow-ups',params={**scope,'offset':100,'limit':100}).json()['total'] == 142
    drafted=client.post('/api/analysis/follow-ups/draft',params=scope,json={'only_empty':True,'lang':'id'})
    assert drafted.status_code == 200,drafted.text
    drafts=drafted.json()['drafts']
    assert len(drafts) == 142
    assert 'Rp 9.031.421' in drafts[0]['note']
    assert client.get('/api/analysis/follow-ups',params={**scope,'follow':'investigating'}).json()['total'] == 0
    items=[{key:draft[key] for key in ['rid','status','note','assignee']} for draft in drafts]
    for item in items:item['assignee']='Andrew'
    saved=client.post('/api/analysis/follow-ups/bulk',json={'items':items},headers={'X-Kira-User':'Andrew'})
    assert saved.status_code == 200,saved.text
    assert saved.json()['saved'] == 142
    for stage in ['l1','l2']:assert client.post(f'/api/matching/{stage}/run',json={}).status_code == 200
    restored=client.get('/api/analysis/follow-ups',params={**scope,'follow':'investigating'}).json()
    assert restored['total'] == 142
    assert all(row['follow_up']['assignee'] == 'Andrew' for row in restored['records'])
    assert client.post('/api/analysis/follow-ups/draft',params=scope,json={'only_empty':True,'lang':'en'}).json()['skipped'] == 142
    snapshots['followup-restored']=restored
    output=web / '.verification' / 'team-contract.json'
    output.write_text(json.dumps(snapshots,ensure_ascii=False,indent=2),encoding='utf-8')
    print('PASS: real team API login, 142 Harbor settlements, Rp 9.031.421, empty bank side, all-page draft, explicit save and persistence after rerunning matching.')
    print(f'Synthetic verification database: {settings.database_url}')
db.dispose_engines()
