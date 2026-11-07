import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import FileSlot from './FileSlot';
import {pickedFileKey} from './engine';
afterEach(cleanup);
it('keeps picks local until Upload is pressed, with size and removal controls',()=>{
 const upload=vi.fn();render(<FileSlot area="pos" busy={false} onUpload={upload}/>);
 fireEvent.change(screen.getByLabelText('POS files for Kira'),{target:{files:[new File(['sale'], 'POS.csv',{type:'text/csv'})]}});
 expect(upload).not.toHaveBeenCalled();expect(screen.getByText('POS.csv')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Upload 1 file'}));expect(upload).toHaveBeenCalledOnce();
});
it('does not submit unsupported files and lets the user remove them',()=>{
 const upload=vi.fn();render(<FileSlot area="bank" busy={false} onUpload={upload}/>);
 fireEvent.change(screen.getByLabelText('Bank files for Kira'),{target:{files:[new File(['x'], 'bank.exe')]}});
 expect(screen.getByRole('alert')).toHaveTextContent('CSV');expect(upload).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Remove bank.exe'}));expect(screen.queryByText('bank.exe')).not.toBeInTheDocument();
});
it('keeps same-named files in different folders separate and retries only unfinished uploads',()=>{
 const upload=vi.fn(),first=new File(['a'],'POS.csv'),second=new File(['b'],'POS.csv');
 Object.defineProperty(first,'webkitRelativePath',{value:'day1/POS.csv'});Object.defineProperty(second,'webkitRelativePath',{value:'day2/POS.csv'});
 const view=render(<FileSlot area="pos" busy={false} onUpload={upload}/>);
 fireEvent.change(screen.getByLabelText('POS folder for Kira'),{target:{files:[first,second]}});
 const progress={[pickedFileKey({file:first,folder:'day1'})]:{state:'Uploaded',percent:100},[pickedFileKey({file:second,folder:'day2'})]:{state:'Failed; retry'}};
 view.rerender(<FileSlot area="pos" busy={false} onUpload={upload} progress={progress}/>);
 fireEvent.click(screen.getByRole('button',{name:'Upload 1 file'}));expect(upload).toHaveBeenCalledWith([{file:second,folder:'day2'}]);
 view.rerender(<FileSlot area="pos" busy onUpload={upload} progress={progress}/>);expect(screen.getByLabelText('POS files for Kira')).toBeDisabled();expect(screen.getByLabelText('POS folder for Kira')).toBeDisabled();
});
it('does not show running progress for failed or unattempted files',()=>{
 const file=new File(['a'],'POS.csv'),view=render(<FileSlot area="pos" busy={false} onUpload={()=>{}}/>);
 fireEvent.change(screen.getByLabelText('POS files for Kira'),{target:{files:[file]}});
 view.rerender(<FileSlot area="pos" busy={false} onUpload={()=>{}} progress={{[pickedFileKey({file,folder:''})]:{state:'Not uploaded; choose again'}}}/>);
 expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();expect(screen.getByText('Not uploaded; choose again')).toBeVisible();
});
it('clears pending picks when removed or when the file area unmounts',()=>{
 const pending=vi.fn(),view=render(<FileSlot area="pos" busy={false} onUpload={()=>{}} onPendingChange={pending}/>);
 fireEvent.change(screen.getByLabelText('POS files for Kira'),{target:{files:[new File(['a'],'POS.csv')]}});
 expect(pending).toHaveBeenLastCalledWith(true);
 fireEvent.click(screen.getByRole('button',{name:'Remove POS.csv'}));expect(pending).toHaveBeenLastCalledWith(false);
 fireEvent.change(screen.getByLabelText('POS files for Kira'),{target:{files:[new File(['a'],'POS.csv')]}});
 expect(pending).toHaveBeenLastCalledWith(true);view.unmount();expect(pending).toHaveBeenLastCalledWith(false);
});
