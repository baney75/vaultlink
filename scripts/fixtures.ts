import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

function crc32(buffer: Buffer): number { let crc=0xffffffff; for(const byte of buffer){crc^=byte;for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0; }
function chunk(type:string,data:Buffer){const t=Buffer.from(type);const length=Buffer.alloc(4);length.writeUInt32BE(data.length);const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(Buffer.concat([t,data])));return Buffer.concat([length,t,data,crc]);}
export function samplePNG(width=960,height=640):Buffer {
 const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;
 const raw=Buffer.alloc((width*3+1)*height);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=y*(width*3+1)+1+x*3;const ridge=height*.55+Math.sin(x/100)*55;const color=y<ridge?[224-Math.floor(y/12),235-Math.floor(y/18),228]:y<ridge+70?[73,116,101]:[31,73,63];raw[i]=color[0]!;raw[i+1]=color[1]!;raw[i+2]=color[2]!;}
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
export async function createFixture(vault:string):Promise<void>{
 await Promise.all(['Notes','Projects','Attachments','Daily'].map(p=>mkdir(join(vault,p),{recursive:true})));
 const notes: Record<string,string>={
 'Welcome.md':`---\ntags: [getting-started, vaultlink]\n---\n# A little room to think\n\nYour notes belong with you. This is a sample vault for exploring VaultLink.\n\n> [!tip] Start here\n> Open a note, make a change, and press **⌘S** or **Ctrl+S** to save.\n\n## Make space for an idea\n\nA good workspace makes it easy to return to a thought. Keep a daily note, collect a reference, and follow the connections.\n\n- [x] Bring your own Markdown\n- [x] Keep the original attachments\n- [ ] Write something worth remembering\n\n## Follow a thread\n\nRead [[Notes/Field notes|Field notes]] or visit [[Projects/Reading room|the reading room]]. Every link stays in your vault.\n\n![A quiet green landscape](Attachments/landscape.png)\n\n## At your own pace\n\nOpen the sidebar beside a source, or give your thoughts a full window. VaultLink saves ordinary files, so they stay useful in Obsidian.\n`,
 'Notes/Field notes.md':`# Field notes\n\nSmall observations from a slower afternoon.\n\n## Things to notice\n\nThe shape of a familiar place changes when you stop rushing through it.\n\n- Light through the window at four o’clock\n- A sentence worth keeping\n- An idea to revisit tomorrow\n\n## Next visit\n\nBring a notebook. Leave a little time unplanned.\n\nBack to [[Welcome]].\n`,
 'Projects/Reading room.md':`# Reading room\n\nA home for questions, references, and the ideas they become.\n\n## This week\n\n| Reference | Question |\n| --- | --- |\n| Field journal | What am I overlooking? |\n| Design notes | What makes a tool inviting? |\n\nOpen [[Notes/Field notes]] and the [[Attachments/reading-guide.pdf|reading guide]].\n\n> [!note] Keep it useful\n> One good question is a fine beginning.\n`,
 'Notes/Ideas.canvas':JSON.stringify({nodes:[{id:'one',type:'text',x:0,y:0,width:300,height:180,text:'# Start with a question\nWhat makes an ordinary day memorable?'},{id:'two',type:'text',x:410,y:80,width:300,height:180,text:'Collect a small observation.\nConnect it to something you already know.'},{id:'three',type:'file',file:'Notes/Field notes.md',x:210,y:330,width:300,height:120}],edges:[{id:'edge',fromNode:'one',fromSide:'right',toNode:'two',toSide:'left',label:'notice'}]},null,2),
 'Notes/Reading list.csv':'Title,Status,Note\nA field journal,Reading,Observe first\nDesign notes,Next,Ask a good question\n'
 };
 await Promise.all(Object.entries(notes).map(([path,body])=>writeFile(join(vault,path),body)));
 await writeFile(join(vault,'Attachments/landscape.png'),samplePNG());
 const pdf=await PDFDocument.create(); const font=await pdf.embedFont(StandardFonts.Helvetica);const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 for(let n=1;n<=3;n++){const page=pdf.addPage([612,792]);page.drawRectangle({x:0,y:0,width:612,height:792,color:rgb(.97,.97,.94)});page.drawText('VAULTLINK / READING ROOM',{x:54,y:724,size:11,font:bold,color:rgb(.13,.32,.27)});page.drawText(n===1?'A guide to good notes':n===2?'Follow the connections':'Leave a useful trail',{x:54,y:649,size:30,font:bold,color:rgb(.12,.15,.14)});page.drawText('Keep a question. Find a reference. Make it your own.',{x:54,y:604,size:15,font,color:rgb(.3,.34,.31)});page.drawText('This sample PDF is safe to annotate, rotate, and save as a copy.',{x:54,y:561,size:12,font,color:rgb(.3,.34,.31)});page.drawText(`Page ${n} of 3`,{x:54,y:50,size:10,font});}
 await writeFile(join(vault,'Attachments/reading-guide.pdf'),await pdf.save());
}
