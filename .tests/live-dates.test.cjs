const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
test('live dates has its own canonical URL, shared monochrome theme and active navigation',()=>{
  const html=fs.readFileSync('live-dates/index.html','utf8');
  assert.match(html,/rel="canonical" href="https:\/\/halfawakeeyes.co.uk\/live-dates\/"/);
  assert.match(html,/home-monochrome\.css/);
  assert.match(html,/aria-current="page"[^>]*>Live dates<\/a>/);
  assert.match(html,/id="public-show-list"/);
  for(const path of ['index.html','store/index.html']){
    const page=fs.readFileSync(path,'utf8');
    assert.match(page,/href="(?:\.\.\/)?live-dates\/">Live dates<\/a>/);
    assert.doesNotMatch(page,/href="(?:\.\.\/)?tickets\/"/);
  }
  assert.match(fs.readFileSync('sitemap.xml','utf8'),/https:\/\/halfawakeeyes.co.uk\/live-dates\//);
});
test('old ticket listing redirects while retaining campaign query and fragment',()=>{
  let destination;
  vm.runInNewContext(fs.readFileSync('assets/js/live-dates-redirect.js','utf8'),{URL,window:{location:{href:'https://halfawakeeyes.co.uk/tickets/',search:'?utm_source=poster',hash:'#dates',replace:url=>destination=String(url)}}});
  assert.equal(destination,'https://halfawakeeyes.co.uk/live-dates/?utm_source=poster#dates');
  assert.match(fs.readFileSync('tickets/index.html','utf8'),/http-equiv="refresh"/);
});
