"""Explicit local Docker smoke test. Synthetic HTTP stub; no weights/downloads/real inference."""
import argparse
import json
from pathlib import Path
import subprocess
import tempfile
import time
import urllib.request
import urllib.error
import uuid

STUB = r'''
require('http').createServer((req,res)=>{
  req.resume();
  const draft={customer:{name:null,phone:null,address:null,township:null},items:[{product_name:'Cup',qty:1,unit_price:1000,sources:{product_name:[1],qty:[2],unit_price:[3]}}],delivery_fee:null,note:null};
  const out=req.url==='/health'?{status:'ok'}:req.url==='/apply-template'?{prompt:'test'}:req.url==='/tokenize'?{tokens:[1,2]}:{choices:[{finish_reason:'stop',message:{content:JSON.stringify({schema_version:'1.0',draft,sources:{customer:{name:[],phone:[],address:[],township:[]},delivery_fee:[],note:[]}})}}]};
  res.setHeader('content-type','application/json');res.end(JSON.stringify(out));
}).listen(8080,'0.0.0.0');
'''

def docker(*args, check=True):
    return subprocess.run(['docker', *args], check=check, text=True, capture_output=True, timeout=120).stdout.strip()

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--image', default='fom-ai:boundary-test')
    args=parser.parse_args()
    name='fom-ai-smoke-'+uuid.uuid4().hex[:10]
    token='synthetic-test-token-'+uuid.uuid4().hex
    try:
        docker('network','create',name)
        docker('network','create','--internal',name+'-model')
        docker('run','-d','--name',name+'-stub','--network',name+'-model','--network-alias','inference',
               '--entrypoint','node',args.image,'-e',STUB)
        with tempfile.TemporaryDirectory(prefix='fom-ai-smoke-') as temporary:
            env=Path(temporary)/'environment';env.write_text(f'FOM_AI_SERVICE_TOKEN={token}\nFOM_AI_SERVICE_ENABLED=true\nFOM_AI_INFERENCE_URL=http://inference:8080\nFOM_AI_ALLOW_PRIVATE_HTTP=true\n')
            env.chmod(0o600)
            docker('create','--name',name+'-api','--network',name,'--read-only','--tmpfs','/tmp',
                   '--cap-drop','ALL','--security-opt','no-new-privileges:true',
                   '-p','127.0.0.1::8081','--env-file',str(env),args.image)
        docker('network','connect',name+'-model',name+'-api')
        docker('start',name+'-api')
        port=json.loads(docker('inspect',name+'-api'))[0]['NetworkSettings']['Ports']['8081/tcp'][0]['HostPort']
        origin='http://127.0.0.1:'+port
        def request(path, value=None, credential=token):
            req=urllib.request.Request(origin+path,data=None if value is None else json.dumps(value).encode(),
                headers={'authorization':'Bearer '+credential,'content-type':'application/json'})
            try:
                with urllib.request.urlopen(req,timeout=10) as response:return response.status,json.load(response)
            except urllib.error.HTTPError as error:return error.code,json.load(error)
        for _ in range(30):
            try:
                if request('/health/ready')[0]==200:break
            except (OSError,ValueError):pass
            time.sleep(1)
        else:raise RuntimeError('Container did not become ready')
        value={'protocol_version':'1','request_id':'smoke-1','message':'Product: Cup\nQty: 1\nUnit price: 1000'}
        assert request('/v1/extractions',value,'wrong')[0]==401
        status,result=request('/v1/extractions',value)
        assert status==200 and result['protocol_version']=='1' and result['request_id']=='smoke-1'
        assert result['data']['draft']['items']==[{'product_name':'Cup','qty':1,'unit_price':1000}]
        assert request('/v1/extractions',{**value,'message':'x'*5001})[0]==422
        print('Container HTTP smoke passed: readiness, authentication, extraction, input limits.')
    finally:
        docker('rm','-f',name+'-api',name+'-stub',check=False)
        docker('network','rm',name+'-model',name,check=False)

if __name__=='__main__':main()
