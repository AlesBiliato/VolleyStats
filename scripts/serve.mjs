import http from 'node:http';import {readFile} from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';
const root=path.resolve(new URL('..',import.meta.url).pathname.replace(/^\/(\w:)/,'$1'));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const vendor={
 '/vendor/jspdf.umd.min.js':'node_modules/jspdf/dist/jspdf.umd.min.js',
 '/vendor/jspdf.plugin.autotable.min.js':'node_modules/jspdf-autotable/dist/jspdf.plugin.autotable.min.js',
};
export function createDevServer(){return http.createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const vendorFile=vendor[pathname];if(!vendorFile&&pathname.startsWith('/node_modules/')){res.writeHead(404);res.end('Not found');return;}const requested=vendorFile||'.'+(pathname==='/'?'/index.html':pathname);const file=path.resolve(root,requested);if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}const data=await readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(data);}catch{res.writeHead(404);res.end('Not found');}})}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)createDevServer().listen(5173,'127.0.0.1',()=>console.log('VolleyStats: http://127.0.0.1:5173'));
