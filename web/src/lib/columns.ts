const labels:Record<string,string>={
  id:'ID',matchmade_bq_id:'Internal ID',branch:'Outlet',merchant_store_name:'Merchant outlet',payment_method:'Provider',
  nett_amount:'Nett amount',gross_amount:'Gross amount',payment_amount:'Payment amount',settlement_amount:'Settlement amount',nett_after_mdr:'Nett after fee',
  sales_datetime_out:'Sale date and time',sales_date_out:'Sale date',transaction_date:'Transaction date',create_time:'Created at',
  tanggal_transaksi:'Bank date',tanggal_transaksi_string:'Bank date text',kredit:'Bank credit',debit:'Bank debit',keterangan:'Bank description',saldo:'Balance',
  reference:'Reference',reference_id:'Reference ID',approval_code:'Approval code',trace_number:'Trace number',sales_number:'Sale number',bill_number:'Bill number',
  row_type:'Row type',transaction_type:'Transaction type',account:'Account',mdr:'Merchant fee',currency_code:'Currency',
};
export function columnLabel(name:string) {
  if(labels[name])return labels[name];
  const words=name.replaceAll('_',' ');return words.charAt(0).toUpperCase()+words.slice(1);
}
