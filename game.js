// ==========================
// PRO FREEBUILD TRAINER
// ==========================

// --- SETTINGS ---
let settings = JSON.parse(localStorage.getItem("settings")) || {
  sensitivity: 0.002,
  editModeType: "release"
};
document.getElementById("sens").value = settings.sensitivity;
function saveSettings() {
  settings.sensitivity = parseFloat(document.getElementById("sens").value);
  localStorage.setItem("settings", JSON.stringify(settings));
}

// --- THREE.JS SETUP ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// LIGHT
const light = new THREE.AmbientLight(0xffffff,1);
scene.add(light);

// --- PLAYER ---
const player = new THREE.Object3D();
player.position.set(0,2,0);
scene.add(player);

// --- BUILD STORAGE ---
let builds = [];
let currentBuild = "wall"; // "wall", "floor", "ramp", "cone"

// --- CROSSHAIR ---
const crosshair = document.getElementById("crosshair");

// --- INPUT ---
const keys = {};
let mouseDown = false;
document.addEventListener("keydown", e => keys[e.code]=true);
document.addEventListener("keyup", e => keys[e.code]=false);
document.addEventListener("mousedown", e => { if(e.button===0) mouseDown=true; });
document.addEventListener("mouseup", e => { if(e.button===0) mouseDown=false; });

// --- MOVEMENT ---
let vel = new THREE.Vector3();
const accel = 60, friction=8;
function move(dt){
  let input = new THREE.Vector3();
  if(keys["KeyW"]) input.z-=1;
  if(keys["KeyS"]) input.z+=1;
  if(keys["KeyA"]) input.x-=1;
  if(keys["KeyD"]) input.x+=1;
  input.normalize();
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y=0; forward.normalize();
  const right = new THREE.Vector3().crossVectors(forward,new THREE.Vector3(0,1,0));
  let wishDir = new THREE.Vector3();
  wishDir.add(forward.clone().multiplyScalar(input.z));
  wishDir.add(right.clone().multiplyScalar(input.x));
  wishDir.normalize();
  vel.add(wishDir.multiplyScalar(accel*dt));
  vel.multiplyScalar(1-friction*dt);
  player.position.add(vel.clone().multiplyScalar(dt));
  vel.y-=30*dt;
  player.position.y+=vel.y*dt;
  if(player.position.y<2){player.position.y=2; vel.y=0;}
  camera.position.copy(player.position).add(new THREE.Vector3(0,1.6,0));
}

// --- BUILD FUNCTIONS ---
function snap(pos){const grid=2; return new THREE.Vector3(Math.round(pos.x/grid)*grid, Math.round(pos.y/grid)*grid, Math.round(pos.z/grid)*grid);}
function createBuild(type){
  let geo;
  switch(type){
    case"wall": geo=new THREE.BoxGeometry(2,4,0.2); break;
    case"floor": geo=new THREE.BoxGeometry(2,0.2,2); break;
    case"ramp": geo=new THREE.BoxGeometry(2,0.2,2); break;
    case"cone": geo=new THREE.ConeGeometry(1,2,4); break;
  }
  const mat=new THREE.MeshBasicMaterial({color:0x00ffcc});
  return new THREE.Mesh(geo,mat);
}
function build(){
  const pos=getBuildPos();
  if(!canPlace(pos)) return;
  const mesh=createBuild(currentBuild);
  mesh.position.copy(pos);
  scene.add(mesh);
  builds.push({mesh,type:currentBuild,edits:[]});
  playBuildSound();
}

// --- BUILD POSITION & ROTATION ---
let buildRotation=0;
document.addEventListener("keydown",e=>{if(e.code==="KeyQ") buildRotation+=Math.PI/2;});
function getBuildPos(){
  const dir=new THREE.Vector3();
  camera.getWorldDirection(dir);
  const pos=player.position.clone().add(dir.multiplyScalar(5));
  return snap(pos);
}

// --- BUILD SOUND ---
const clickSound = new Audio("assets/click.mp3");
function playBuildSound(){clickSound.currentTime=0; clickSound.play();}

// --- EDIT SYSTEM ---
let editMode=false, selected=null, editTiles=[], isDragging=false, lastTile=null, hoverTile=null, highlightMesh=null, ghostMesh=null;
document.addEventListener("keydown",e=>{if(e.code==="KeyE"){editMode=!editMode; editTiles=[]; selected=null;}});
document.addEventListener("keydown",e=>{if(e.code==="Enter" && selected) applyEdit(selected);});
document.addEventListener("keydown",e=>{if(e.code==="KeyR") resetEdit();});
document.addEventListener("mousedown",e=>{if(editMode && e.button===0){isDragging=true; editTiles=[];}});
document.addEventListener("mouseup",()=>{if(editMode && isDragging){isDragging=false; if(settings.editModeType==="release") {applyEdit(selected); resetEdit();}}});
function getTile(hitPoint,build){const local=build.mesh.worldToLocal(hitPoint.clone());const size=2;const tileSize=size/3;let x=Math.floor((local.x+size/2)/tileSize); let y=Math.floor((local.y+size/2)/tileSize); return `${x},${y}`;}
function updateHoverTile(){if(!editMode||!selected) return; const ray=new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(0,0),camera); const hit=ray.intersectObject(selected.mesh)[0]; if(!hit) return; const tile=getTile(hit.point,selected); hoverTile=tile; if(highlightMesh) scene.remove(highlightMesh); const size=2; const tileSize=size/3; const [x,y]=tile.split(",").map(Number); highlightMesh=new THREE.Mesh(new THREE.BoxGeometry(tileSize,tileSize,0.21), new THREE.MeshBasicMaterial({color:0xffff00,transparent:true,opacity:0.5})); highlightMesh.position.set(selected.mesh.position.x+(x-1)*tileSize,selected.mesh.position.y+(y-1)*tileSize,selected.mesh.position.z); scene.add(highlightMesh);}
function handleDragEdit(){if(!editMode||!selected||!isDragging) return; const ray=new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(0,0),camera); const hit=ray.intersectObject(selected.mesh)[0]; if(!hit) return; const tile=getTile(hit.point,selected); if(tile!==lastTile&&!editTiles.includes(tile)){editTiles.push(tile); lastTile=tile;}}
function updateGhost(){if(!selected) return; if(ghostMesh) scene.remove(ghostMesh); const group=new THREE.Group(); const size=2; const tileSize=size/3; for(let x=0;x<3;x++){for(let y=0;y<3;y++){const key=`${x},${y}`; if(editTiles.includes(key)) continue; const piece=new THREE.Mesh(new THREE.BoxGeometry(tileSize,tileSize,0.2), new THREE.MeshBasicMaterial({color:0x00ffff,transparent:true,opacity:0.4})); piece.position.set((x-1)*tileSize,(y-1)*tileSize,0); group.add(piece);}} group.position.copy(selected.mesh.position); ghostMesh=group; scene.add(ghostMesh);}
function applyEdit(build){if(!selected) return; scene.remove(build.mesh); const group=new THREE.Group(); const size=2; const tileSize=size/3; for(let x=0;x<3;x++){for(let y=0;y<3;y++){const key=`${x},${y}`; if(editTiles.includes(key)) continue; const piece=new THREE.Mesh(new THREE.BoxGeometry(tileSize,tileSize,0.2), new THREE.MeshBasicMaterial({color:0x00ffcc})); piece.position.set((x-1)*tileSize,(y-1)*tileSize,0); group.add(piece);}} group.position.copy(build.mesh.position); scene.add(group); build.mesh=group; build.edits=editTiles; editTiles=[]; if(ghostMesh) scene.remove(ghostMesh);}
function resetEdit(){editTiles=[]; lastTile=null; isDragging=false; if(ghostMesh) scene.remove(ghostMesh); if(highlightMesh) scene.remove(highlightMesh);}
function canPlace(pos){return !builds.some(b=>b.mesh.position.distanceTo(pos)<0.1);}

// --- GAME LOOP ---
let last=performance.now();
function animate(){
  requestAnimationFrame(animate);
  const now=performance.now(); const dt=(now-last)/1000; last=now;
  move(dt);
  if(mouseDown) build();
  handleDragEdit();
  updateHoverTile();
  updateGhost();
  renderer.render(scene,camera);
}
animate();
