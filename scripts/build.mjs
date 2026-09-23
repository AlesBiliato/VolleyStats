import {mkdir,cp} from 'node:fs/promises';
await mkdir('dist',{recursive:true});for(const file of ['index.html','src','sw.js','icon.svg','manifest.webmanifest'])await cp(file,'dist/'+file,{recursive:true});console.log('Build listo en dist/');
