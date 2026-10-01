import fs from 'node:fs';
import assert from 'node:assert/strict';
import {jsPDF} from 'jspdf';
import {generateInterviewReviewPdf} from './src/services/pdfService';
import {saviLogoPng} from './src/assets/pdf-fonts/saviLogo';
assert.deepEqual(Buffer.from(saviLogoPng.split(',')[1],'base64'),fs.readFileSync('public/favicon-192x192.png'),'PDF must use exact official UI logo bytes');
let saved=false;
const rendered: {text:string;x:number;y:number;font:string}[]=[];
jsPDF.API.events.push(['initialized',function(this:jsPDF){
  const originalText=this.text.bind(this);
  this.text=((text:any,x:number,y:number,...args:any[])=>{
    rendered.push({text:Array.isArray(text)?text.join(' '):String(text),x,y,font:this.getFont().fontName});
    return (originalText as any)(text,x,y,...args);
  }) as jsPDF['text'];
  this.save=((name:string)=>{
    assert(name.startsWith('Savi-Interview-Review-'));
    assert(!this.output().includes('/Subtype /Image'),'PDF header must not include a logo image');
    assert(rendered.every(row=>row.font==='Manrope'||row.font==='Fraunces'),'All PDF text must use existing UI font families');
    assert(rendered.some(row=>row.text==='Savi' && row.x===40),'Savi wordmark must align with the title');
    const title=rendered.find(row=>row.text==='Interview Review')!;
    const role=rendered.find(row=>row.text==='Target Role: Software Developer')!;
    const date=rendered.find(row=>row.text==='October 1, 2026')!;
    assert(title&&role&&date);
    assert(title.x===40&&role.x===40&&date.x===40,'Header metadata must remain left-aligned');
    assert(title.y<role.y&&role.y<date.y,'Header must stack title, role and date');
    assert(title.font==='Fraunces'&&role.font==='Manrope');
    assert(rendered.some(row=>row.text.includes('Describe an API you built.')));
    assert(rendered.some(row=>row.text.includes('I implemented the endpoint and tested its failure modes.')));
    assert(rendered.some(row=>row.text.includes('Duration: 42s')));
    assert(rendered.some(row=>row.text.includes('Include a measured outcome.')));
    saved=true;return this;
  }) as jsPDF['save'];
}]);
await generateInterviewReviewPdf({jobRole:'Software Developer',completedAt:'Oct 1, 2026, 10:00 AM',status:'Completed',exchanges:[{id:'branding-test',order:1,question:'Describe an API you built.',userAnswer:'I implemented the endpoint and tested its failure modes.',durationSeconds:42,aiNotes:['Include a measured outcome.'],aiNotesStatus:'success',timestamp:'10:00 AM'}]});
assert(saved,'Browser download must still be triggered');
console.log('PDF branding functional checks passed: wordmark without logo image, UI fonts, left-aligned header, unchanged transcript/duration/notes, and download.');

