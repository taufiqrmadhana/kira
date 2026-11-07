import RecordsTable,{type RecordsTableProps} from './RecordsTable';

export default function Chains({scope='',onScopeChange,...props}:Omit<RecordsTableProps,'view'>){
  const params=new URLSearchParams(scope);params.set('pos_only','true');
  return <RecordsTable {...props} view="chains" caption={props.caption??'Chains'} scope={params.toString()} onScopeChange={onScopeChange?next=>{const filters=new URLSearchParams(next);filters.delete('pos_only');onScopeChange(filters.toString());}:undefined}/>;
}
