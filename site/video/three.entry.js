// The subset of three.js the film uses. Rebuild three.min.js with:
//   npm pack three@0.186.1 && mkdir -p node_modules && tar xzf three-0.186.1.tgz && mv package node_modules/three
//   npx esbuild@0.25.10 three.entry.js --bundle --minify --format=esm --legal-comments=none --outfile=three.min.js
export {
  WebGLRenderer, Scene, OrthographicCamera, PerspectiveCamera, Group, Mesh, InstancedMesh,
  ExtrudeGeometry, Shape, PlaneGeometry, BoxGeometry, MeshStandardMaterial, MeshBasicMaterial,
  ShadowMaterial, HemisphereLight, DirectionalLight, AmbientLight, Color, Vector3, Matrix4,
  Object3D, PCFShadowMap, SRGBColorSpace, ACESFilmicToneMapping, NoToneMapping, Fog,
  LineSegments, LineBasicMaterial, BufferGeometry, Float32BufferAttribute, EdgesGeometry,
} from 'three';
