import test from 'node:test';
import assert from 'node:assert/strict';
import {selectNextShardReview} from '../src/rhea/artifact-review-selection.ts';
const RUN=40087656497;
const shard=(n,over={})=>({id:100+n,name:'near-rhea-shard-'+n,expired:false,size_in_bytes:400,
 workflow_run:{id:RUN},...over});
test('selects smallest unreviewed real shard while another source scan is still active',()=>{
 const p=selectNextShardReview(RUN,{artifacts:[shard(11),shard(2),shard(0)]},[]);
 assert.equal(p.shardId,0);assert.equal(p.marketCoverageVerified,false);assert.equal(p.executionEnabled,false);
 const next=selectNextShardReview(RUN,{artifacts:[shard(11),shard(2),shard(0)]},
  ['near-rhea-stage21-reviewed-'+RUN+'-shard-0']);
 assert.equal(next.shardId,2);assert.equal(next.sourceArtifactName,'near-rhea-shard-2');
});
test('completed review markers are run-scoped, stale attempts do not hide a shard',()=>{
 const names=['near-rhea-stage21-reviewed-999999-shard-0',
 'near-rhea-stage21-attempt-'+RUN+'-shard-0','near-rhea-stage21-reviewed-'+RUN+'-shard-1'];
 assert.equal(selectNextShardReview(RUN,{artifacts:[shard(0),shard(1)]},names).shardId,0);
 assert.equal(selectNextShardReview(RUN,{artifacts:[shard(1)]},names),null);
});
test('an empty source artifact collection is a safe no-op, not a debt-free claim',()=>{
 assert.equal(selectNextShardReview(RUN,{artifacts:[]},[]),null);
 assert.equal(selectNextShardReview(RUN,{artifacts:[{name:'near-rhea-borrower-witness'}]},[]),null);
});
test('expired shards are ignored but malformed provenance and duplicate ids fail closed',()=>{
 assert.equal(selectNextShardReview(RUN,{artifacts:[shard(1,{expired:true}),shard(2)]},[]).shardId,2);
 assert.throws(()=>selectNextShardReview(RUN,{artifacts:[shard(0,{workflow_run:{id:42}})]},[]),/PROVENANCE/);
 assert.throws(()=>selectNextShardReview(RUN,{artifacts:[shard(1),shard(1,{id:999})]},[]),/DUPLICATE/);
 assert.throws(()=>selectNextShardReview(RUN,{artifacts:[shard(96)]},[]),/OUT_OF_RANGE/);
 assert.throws(()=>selectNextShardReview(RUN,{artifacts:[shard(0,{size_in_bytes:0})]},[]),/STATE/);
});
test('rejects invalid run identifiers, unsafe meta records, or missing provenance',()=>{
 assert.throws(()=>selectNextShardReview(0,{artifacts:[]},[]),/SOURCE_RUN/);
 assert.throws(()=>selectNextShardReview(RUN,{},[]),/METADATA/);
 assert.throws(()=>selectNextShardReview(RUN,{artifacts:[shard(0)]},[123]),/METADATA/);
 assert.throws(()=>selectNextShardReview(RUN,{artifacts:[shard(0,{workflow_run:null})]},[]),/PROVENANCE/);
 assert.throws(()=>selectNextShardReview(RUN,{artifacts:[shard(0)]},[],129),/SOURCE_RUN/);
});

test('review workflow uses active GitHub expressions and shell variables',async()=>{
 const {readFile}=await import('node:fs/promises');
 const yaml=await readFile(new URL('../.github/workflows/rhea-progressive-shard-review.yml',import.meta.url),'utf8');
 assert.equal(yaml.includes(String.fromCharCode(92)+'${'),false);
 assert.ok(yaml.includes('${{ github.token }}'));
 assert.ok(yaml.includes('${{ steps.pick.outputs.run }}'));
 assert.ok(yaml.includes('repos/${GITHUB_REPOSITORY}/actions/runs/'));
 assert.ok(yaml.includes("cron: '23 * * * *'"));
});

test('automatic lookup filters all main-branch workflow runs by the exact index workflow name',async()=>{
 const {readFile}=await import('node:fs/promises');
 const yaml=await readFile(new URL('../.github/workflows/rhea-progressive-shard-review.yml',import.meta.url),'utf8');
 assert.ok(yaml.includes('actions/runs?event=push&branch=main&per_page=100'));
 assert.ok(yaml.includes('select(.name == "NEAR Rhea sharded borrower index (read only)")'));
 assert.ok(!yaml.includes('actions/workflows/rhea-sharded-index.yml/runs?'));
});

test('selector writes pure JSON and malformed output fails the GitHub job',async()=>{
 const {readFile}=await import('node:fs/promises');
 const w=await readFile(new URL('../.github/workflows/rhea-progressive-shard-review.yml',import.meta.url),'utf8');
 assert.ok(w.includes('node --experimental-strip-types src/rhea/artifact-review-selector-cli.ts > selected-shard.json'));
 assert.ok(!w.includes('npm run probe:rhea:select-shard-review > selected-shard.json'));
 assert.ok(w.includes("jq -e 'type == \"object\""));
});
