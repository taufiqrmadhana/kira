import {useEffect,useId,useState} from 'react';
import {parseDisplayDate} from '../lib/format';

export default function DateField({label,value,min,max,onChange}:{label:string;value:string;min?:string;max?:string;onChange:(value:string)=>void}){
    const display=(iso:string)=>iso?iso.split('-').reverse().join('/'):'';
    const [text,setText]=useState(display(value)),[error,setError]=useState('');
    const id=useId();
    useEffect(()=>{setText(display(value));setError('');},[value]);
    function commit(){
        const parsed=parseDisplayDate(text);
        if(parsed===null){setError('Enter a real date as dd/mm/yyyy.');return;}
        if(parsed&&min&&parsed<min){setError(`Choose ${display(min)} or later.`);return;}
        if(parsed&&max&&parsed>max){setError(`Choose ${display(max)} or earlier.`);return;}
        setError('');if(parsed!==value)onChange(parsed);
    }
    return <label className="date-field">{label}<input type="text" inputMode="numeric" placeholder="dd/mm/yyyy" aria-label={`${label} date (dd/mm/yyyy)`} aria-invalid={!!error} aria-describedby={error?id:undefined} value={text} maxLength={10} onChange={event=>setText(event.target.value)} onBlur={commit} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();event.currentTarget.blur();}}}/>{error&&<small id={id} role="alert" className="error-text">{error}</small>}</label>;
}
