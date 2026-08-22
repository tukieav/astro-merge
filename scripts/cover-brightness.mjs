// Enforces the Round 4 marketplace-cover brightness requirement without a third-party image parser.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
const files=process.argv.slice(2).length?process.argv.slice(2):['marketing/cover-16x9.png','marketing/cover-16x9-small.png','marketing/cover-2x3.png','marketing/cover-1x1.png'];
let failed=false;
for(const file of files){if(!existsSync(file)){console.log(`FAIL ${file} missing`);failed=true;continue;}const rgb=execFileSync('ffmpeg',['-v','error','-i',file,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-'],{maxBuffer:64*1024*1024});let lumTotal=0,satTotal=0,dark=0;const pixels=rgb.length/3;for(let i=0;i<rgb.length;i+=3){const r=rgb[i],g=rgb[i+1],b=rgb[i+2],max=Math.max(r,g,b),min=Math.min(r,g,b),lum=.2126*r+.7152*g+.0722*b;lumTotal+=lum;satTotal+=max===0?0:(max-min)/max;if(lum<40)dark++;}const meanLum=lumTotal/pixels,darkFrac=dark/pixels,meanSat=satTotal/pixels,pass=meanLum>=80&&darkFrac<=.35&&meanSat>=.35;console.log(`${pass?'PASS':'FAIL'} ${file} meanLum=${meanLum.toFixed(2)} darkFrac=${darkFrac.toFixed(4)} meanSat=${meanSat.toFixed(4)}`);failed||=!pass;}
process.exit(failed?1:0);
