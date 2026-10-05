const assert = require('node:assert/strict');
const fs = require('node:fs');
const {fileURLToPath} = require('node:url');
function run(assets, config, PetModel, display) {
  const names = ['alert-left','alert-right','idle-tilt','idle-blink','petted-smooth','sleep-enter','sleep-wake','sleep-breathe'];
  for(const action of names) {
    assert.equal(assets[action]?.length,8,action);
    for(const url of assets[action]) {
      const png=fs.readFileSync(fileURLToPath(url));
      assert.equal(png.readUInt32BE(16),256);assert.equal(png.readUInt32BE(20),256);assert.equal(png[25],6);
    }
  }
  const pet=new PetModel(config,()=>.25);
  const shown=()=>display(assets,pet,config);
  pet.enter('sleep',60000);
  for(let frame=1;frame<=8;frame++){assert.equal(shown().action,'sleep-enter');assert.equal(shown().frame,frame);pet.tick(100);}
  assert.equal(shown().action,'sleep-breathe');assert.equal(shown().frame,1);
  pet.tick(350*8);assert.equal(shown().frame,1);
  pet.proximity(true);assert.equal(pet.state,'idle');assert.equal(shown().action,'sleep-wake');
  pet.enter('petted',1200);assert.equal(shown().action,'petted-smooth');assert.equal(pet.wakeUntil,0);
  for(let frame=1;frame<=8;frame++){assert.equal(shown().frame,frame);pet.tick(150);}
  assert.equal(pet.state,'idle');
  pet.enter('sleep',60000);pet.tick(120);pet.proximity(true);
  assert.equal(shown().action,'sleep-enter');assert.equal(shown().frame,2);
  pet.tick(100);assert.equal(shown().frame,1);pet.tick(100);assert.equal(pet.state,'idle');
  pet.enter('sleep',60000);pet.tick(1000);pet.proximity(true);
  for(let frame=1;frame<=8;frame++){assert.equal(shown().action,'sleep-wake');assert.equal(shown().frame,frame);pet.tick(100);}
  assert.equal(shown().action,'idle');
  pet.enter('alert',2500);
  for(let i=0;i<32;i++) {
    const value=shown();assert.equal(value.action,i<16?'alert-left':'alert-right');
    const phase=i%16;assert.equal(value.frame,phase<8?phase+1:16-phase);
    pet.tick(2500/32);
  }
  assert.equal(pet.state,'idle');
  pet.nextBlink=pet.time;pet.tick(0);
  let closed=0;
  for(let i=0;i<240;i++){const value=shown();assert.equal(value.action,'idle-blink');if(value.frame===4||value.frame===5)closed++;pet.tick(1);}
  assert.equal(closed,120);assert.equal(pet.state,'idle');
  pet.config={...config,idleVariants:true}; pet.nextVariant=pet.time;pet.nextBlink=Infinity;pet.tick(0);
  assert.equal(shown().frame,1);pet.tick(500);assert.equal(shown().frame,8);
  pet.tick(1000);assert(shown().frame<8);pet.tick(300);assert.equal(shown().action,'idle');
  pet.enter('sleep',60000);pet.tick(1000);pet.proximity(true);pet.enter('dragged');
  assert.equal(shown().action,'lifted');pet.tick(500);assert.equal(shown().frame,1);
  pet.active.clear();assert.equal(display(assets,pet,config,'falling').action,'falling');
  console.log('[selftest] 64 RGBA frames, sleep entry/breath/wake, early wake, interrupt priority, alert paths, closed-eye 120ms, tilt and fixed drag/fall: PASS');
}
module.exports={run};
