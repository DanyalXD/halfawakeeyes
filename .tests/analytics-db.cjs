// In-memory Firestore fake: staged commits let tests verify atomic aggregation/deletion.
function database(seed={}) {
  const rows=new Map(), reads=[], writes=[];
  for(const [name,records] of Object.entries(seed)) for(const [id,data] of Object.entries(records)) rows.set(`${name}/${id}`,data);
  const snapshot=ref=>{const data=rows.get(ref.path);return {id:ref.id,ref,exists:rows.has(ref.path),data:()=>data};};
  const db={rows,reads,writes,failCommit:false,
    collection(name) {
      const make=(filters=[],order='__name__',size=Infinity,cursor=null)=>({
        doc:id=>({id,path:`${name}/${id}`}),
        where:(field,op,value)=>make([...filters,[field,op,value]],order,size,cursor),
        orderBy:field=>make(filters,typeof field==='string'?field:'__name__',size,cursor),
        limit:count=>make(filters,order,count,cursor),
        startAfter:doc=>make(filters,order,size,doc),
        async get() {
          reads.push(name);
          const docs=[...rows.keys()].filter(key=>key.startsWith(name+'/')).map(path=>snapshot({path,id:path.split('/')[1]}))
            .filter(doc=>filters.every(([field,op,value])=>op==='>='?doc.data()[field]>=value:op==='<='?doc.data()[field]<=value:doc.data()[field]===value))
            .sort((a,b)=>order==='__name__'?a.id.localeCompare(b.id):a.data()[order]-b.data()[order] || a.id.localeCompare(b.id));
          const offset=cursor ? docs.findIndex(doc=>order==='__name__' ? doc.id.localeCompare(cursor.id)>0 : doc.data()[order]>cursor.data()[order] || doc.data()[order].valueOf()===cursor.data()[order].valueOf() && doc.id.localeCompare(cursor.id)>0) : 0;
          if (cursor && offset<0) return {docs:[],size:0,empty:true};
          const selected=docs.slice(offset,offset+size);return {docs:selected,size:selected.length,empty:!selected.length};
        }
      });return make();
    },
    async runTransaction(run) {
      const staged=[];
      const result=await run({get:async ref=>snapshot(ref),set:(ref,data)=>staged.push(['set',ref,data]),delete:ref=>staged.push(['delete',ref])});
      if(db.failCommit) throw Error('Commit failed');
      for(const [kind,ref,data] of staged) {writes.push({kind,path:ref.path,data});if(kind==='set') rows.set(ref.path,data);else rows.delete(ref.path);}
      return result;
    },
    batch() {
      const refs=[];return {delete:ref=>refs.push(ref),commit:async()=>{for(const ref of refs) {rows.delete(ref.path);writes.push({kind:'delete',path:ref.path});}}};
    }
  };return db;
}
module.exports={database};
