import {
  WebGLRenderer, Scene, OrthographicCamera, InstancedMesh, BoxGeometry, MeshStandardMaterial,
  ShadowMaterial, PlaneGeometry, Mesh, HemisphereLight, DirectionalLight, Color, Vector3, Object3D,
  PCFShadowMap, SRGBColorSpace, LineSegments, LineBasicMaterial, BufferGeometry, Float32BufferAttribute,
} from './three.min.js';
import { rgbOf } from './lib.js';

export const MAX_TURNS = 40;
export const SPACING = 1;
const COL_W = 0.72;
const GAP = 0.018;
export const K = 0.16; // world units per 1k tokens
const GRID_EXTENT = 40;

// one entry per piece of content: [thousands of tokens, color token]
export function sessionItems(random) {
  const items = [[3.2, 'sys'], [0.4, 'prompt']];
  for (let i = 1; i < MAX_TURNS; i++) items.push([0.35 + random() * 0.75, 'r' + (i % 3)]);
  return items;
}
export const FILE_ITEM = 3;

const PALETTE = {
  dark: {
    sys: 'oklch(58% 0.07 285)',
    prompt: 'oklch(90% 0.035 85)',
    r0: 'oklch(68% 0.075 235)',
    r1: 'oklch(72% 0.07 190)',
    r2: 'oklch(64% 0.08 305)',
    file: 'oklch(76% 0.13 45)',
    sky: 'oklch(70% 0.06 280)',
    ground: 'oklch(30% 0.05 320)',
    grid: 'oklch(40% 0.04 295)',
  },
  light: {
    sys: 'oklch(62% 0.08 285)',
    prompt: 'oklch(97% 0.03 88)',
    r0: 'oklch(72% 0.08 235)',
    r1: 'oklch(76% 0.075 190)',
    r2: 'oklch(70% 0.085 305)',
    file: 'oklch(68% 0.15 42)',
    sky: 'oklch(98% 0.02 280)',
    ground: 'oklch(80% 0.05 40)',
    grid: 'oklch(82% 0.035 70)',
  },
};

export class Staircase {
  constructor(canvas, items, width, height) {
    this.items = items;
    this.width = width;
    this.height = height;
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;

    this.scene = new Scene();
    this.camera = new OrthographicCamera(-960, 960, 540, -540, 0.1, 400);

    this.hemi = new HemisphereLight(0xffffff, 0x444444, 1.9);
    this.scene.add(this.hemi);
    this.sun = new DirectionalLight(0xffffff, 2.1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.radius = 6;
    this.sun.shadow.bias = -0.0008;
    const sc = this.sun.shadow.camera;
    sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 140;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.ground = new Mesh(new PlaneGeometry(400, 400), new ShadowMaterial({ opacity: 0.28 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    // cross lines are cut per column; long lines are a unit length stretched to the columns in view
    const cross = [];
    for (let i = 0; i <= GRID_EXTENT; i++) {
      const x = i * SPACING - SPACING / 2;
      cross.push(x, 0.001, -1.5, x, 0.001, 1.5);
    }
    const along = [];
    for (let z = -1.5; z <= 1.5; z += 1) along.push(0, 0.001, z, 1, 0.001, z);
    this.gridMat = new LineBasicMaterial({ transparent: true, opacity: 0.5 });
    const lineSet = pts => {
      const geo = new BufferGeometry();
      geo.setAttribute('position', new Float32BufferAttribute(pts, 3));
      const lines = new LineSegments(geo, this.gridMat);
      lines.frustumCulled = false;
      this.scene.add(lines);
      return lines;
    };
    this.gridCross = lineSet(cross);
    this.gridAlong = lineSet(along);
    this.gridAlong.position.x = -SPACING / 2;

    this.count = 0;
    this.slots = [];
    for (let k = 1; k <= MAX_TURNS; k++) for (let j = 0; j <= k; j++) this.slots.push([k, j]);
    this.material = new MeshStandardMaterial({ roughness: 0.72, metalness: 0 });
    this.mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), this.material, this.slots.length);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);

    this.dummy = new Object3D();
    this.v = new Vector3();
    this.right = new Vector3();
    this.up = new Vector3();
    this.dir = new Vector3();
    this.theme();
  }

  theme() {
    const mode = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    const pal = PALETTE[mode];
    const color = name => new Color().setRGB(...rgbOf(pal[name]));
    this.colors = {};
    for (const key of Object.keys(pal)) this.colors[key] = color(key);
    this.hemi.color.copy(this.colors.sky);
    this.hemi.groundColor.copy(this.colors.ground);
    this.gridMat.color.copy(this.colors.grid);
    this.ground.material.opacity = mode === 'light' ? 0.11 : 0.34;
    this.hemi.intensity = mode === 'light' ? 1.7 : 1.9;
    this.paint();
  }

  paint() {
    this.slots.forEach(([, j], i) => {
      const key = j === FILE_ITEM && this.fileHot ? 'file' : this.items[j][1];
      this.mesh.setColorAt(i, this.colors[key]);
    });
    this.mesh.instanceColor.needsUpdate = true;
  }

  dispose() {
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  resize(pixelRatio) {
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(this.width, this.height, false);
  }

  // box: [x0, y0, z0, x1, y1, z1] in world units, region: [x, y, w, h] in stage px
  frame(box, region, yaw, pitch) {
    const { camera, dir, right, up, v } = this;
    dir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    right.set(Math.cos(yaw), 0, -Math.sin(yaw));
    up.crossVectors(dir, right);
    let minR = Infinity, maxR = -Infinity, minU = Infinity, maxU = -Infinity;
    for (let i = 0; i < 8; i++) {
      v.set(i & 1 ? box[3] : box[0], i & 2 ? box[4] : box[1], i & 4 ? box[5] : box[2]);
      const r = v.dot(right);
      const u = v.dot(up);
      minR = Math.min(minR, r); maxR = Math.max(maxR, r);
      minU = Math.min(minU, u); maxU = Math.max(maxU, u);
    }
    const [rx, ry, rw, rh] = region;
    const zoom = Math.min(rw / (maxR - minR), rh / (maxU - minU));
    const cr = (minR + maxR) / 2;
    const cu = (minU + maxU) / 2;
    const target = right.clone().multiplyScalar(cr).add(up.clone().multiplyScalar(cu));
    camera.position.copy(target).addScaledVector(dir, 120);
    camera.up.copy(up);
    camera.lookAt(target);
    const sx = rx + rw / 2;
    const sy = ry + rh / 2;
    camera.left = -sx / zoom;
    camera.right = (this.width - sx) / zoom;
    camera.top = sy / zoom;
    camera.bottom = (sy - this.height) / zoom;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    this.sun.position.copy(target).add(v.set(-14, 26, 22));
    this.sun.target.position.copy(target);
    const span = Math.max(maxR - minR, maxU - minU) * 0.75 + 4;
    const sc = this.sun.shadow.camera;
    sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span;
    sc.updateProjectionMatrix();
  }

  // state.turn(k) -> 0..1 how far column k has risen; state.drop(k) -> 0..1 of its new top slab
  // state.tokens(j, k) -> thousands of tokens for item j inside column k
  render(state) {
    const { dummy, mesh } = this;
    if (state.fileHot !== this.fileHot) {
      this.fileHot = state.fileHot;
      this.paint();
    }
    let i = 0;
    for (let k = 1; k <= MAX_TURNS; k++) {
      const rise = state.turn(k);
      const drop = state.drop(k);
      let y = 0;
      for (let j = 0; j <= k; j++, i++) {
        const top = j === k;
        const h = state.tokens(j, k) * K * rise;
        const shown = rise > 0.001 && h > 0.0005 && (!top || drop > 0.001);
        if (!shown) {
          dummy.scale.set(0, 0, 0);
        } else {
          const lift = top ? (1 - drop) * 1.2 : 0;
          const scale = top ? 0.6 + 0.4 * drop : 1;
          dummy.scale.set(COL_W * scale, Math.max(0.0005, h - GAP), COL_W * scale);
          dummy.position.set((k - 1) * SPACING, y + h / 2 + lift, 0);
        }
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        y += h;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    const cols = state.gridTurns;
    this.gridCross.geometry.setDrawRange(0, (Math.ceil(cols) + 1) * 2);
    this.gridAlong.scale.x = cols * SPACING;
    this.frame(state.box, state.region, state.yaw, state.pitch);
    this.renderer.render(this.scene, this.camera);
  }

  project(x, y, z) {
    const p = this.v.set(x, y, z).project(this.camera);
    return [(p.x + 1) * 0.5 * this.width, (1 - p.y) * 0.5 * this.height];
  }
}
