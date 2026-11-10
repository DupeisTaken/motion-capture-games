import * as THREE from "three";
import type { RunnerState } from "../../../games/motion-runner/src/index";

export type RunnerSkin = "nova" | "moss" | "ember";
export type RunnerWorld = "rail" | "gold";
const LANE_WIDTH = 2.5;
const PALETTES = {
  nova: { jacket: 0x46d8e8, dark: 0x26314e, accent: 0xfe7965, face: 0xf3c5a1 },
  moss: { jacket: 0x9cda72, dark: 0x284d48, accent: 0xffd16e, face: 0xf6e2ba },
  ember: { jacket: 0xff9570, dark: 0x55385e, accent: 0xc5b3ff, face: 0xf7c7a5 },
} as const;

/** Original low-poly models; all motion is derived from the paused game clock. */
export function createRunnerRenderer(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(56, 1, 0.1, 190);
  const hemisphere = new THREE.HemisphereLight(0xe5f9ff, 0x67768b, 2.7);
  scene.add(hemisphere);
  const sunLight = new THREE.DirectionalLight(0xffeed2, 3);
  sunLight.position.set(-15, 28, 18);
  scene.add(sunLight);
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Map<number, THREE.MeshStandardMaterial>();
  const textures: THREE.Texture[] = [];
  const signMaterials = new Map<string, THREE.MeshBasicMaterial>();
  const boxGeometry = geometry(new THREE.BoxGeometry(1, 1, 1));
  const sphereGeometry = geometry(new THREE.SphereGeometry(1, 12, 8));
  const coinGeometry = geometry(
    new THREE.CylinderGeometry(0.32, 0.32, 0.11, 12),
  );
  const discGeometry = geometry(new THREE.CircleGeometry(1, 24));
  const coneGeometry = geometry(new THREE.ConeGeometry(1, 1, 5));
  const signGeometry = geometry(new THREE.PlaneGeometry(1, 0.25));
  const trunkGeometry = geometry(new THREE.CylinderGeometry(0.1, 0.2, 4.5, 6));
  function geometry<T extends THREE.BufferGeometry>(value: T): T {
    geometries.add(value);
    return value;
  }
  function material(color: number) {
    let value = materials.get(color);
    if (!value) {
      value = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.72,
        metalness: 0.08,
      });
      materials.set(color, value);
    }
    return value;
  }
  function mesh(
    parent: THREE.Object3D,
    geo: THREE.BufferGeometry,
    color: number,
    x: number,
    y: number,
    z: number,
    sx = 1,
    sy = 1,
    sz = 1,
  ) {
    const value = new THREE.Mesh(geo, material(color));
    value.position.set(x, y, z);
    value.scale.set(sx, sy, sz);
    parent.add(value);
    return value;
  }
  function box(
    parent: THREE.Object3D,
    color: number,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
  ) {
    return mesh(parent, boxGeometry, color, x, y, z, sx, sy, sz);
  }
  const scenery = new THREE.Group();
  const ground = new THREE.Group();
  scenery.name = "scenery";
  ground.name = "ground";
  scene.add(ground, scenery);
  const scrolling: { group: THREE.Group; offset: number }[] = [];
  const sleepers: THREE.InstancedMesh[] = [];
  const matrix = new THREE.Matrix4();
  function sign(
    parent: THREE.Object3D,
    text: string,
    color: string,
    x: number,
    y: number,
    z: number,
    width: number,
  ) {
    let signMaterial = signMaterials.get(text);
    if (!signMaterial) {
      const art = document.createElement("canvas");
      art.width = 512;
      art.height = 128;
      const ctx = art.getContext("2d")!;
      ctx.fillStyle = "#19394a";
      ctx.fillRect(0, 0, 512, 128);
      ctx.strokeStyle = color;
      ctx.lineWidth = 9;
      ctx.strokeRect(6, 6, 500, 116);
      ctx.fillStyle = color;
      ctx.font = "bold 60px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(text, 256, 84);
      const texture = new THREE.CanvasTexture(art);
      texture.colorSpace = THREE.SRGBColorSpace;
      textures.push(texture);
      signMaterial = new THREE.MeshBasicMaterial({ map: texture });
      signMaterials.set(text, signMaterial);
    }
    const label = new THREE.Mesh(signGeometry, signMaterial);
    label.scale.setScalar(width);
    label.position.set(x, y, z);
    parent.add(label);
  }
  function makeWorld(world: RunnerWorld) {
    for (const ties of sleepers) ties.dispose();
    ground.clear();
    scenery.clear();
    scrolling.length = 0;
    sleepers.length = 0;
    const gold = world === "gold";
    scene.background = new THREE.Color(gold ? 0xf9cda0 : 0xb0dce7);
    scene.fog = new THREE.Fog(gold ? 0xf7c99c : 0xb0dce7, 40, 150);
    hemisphere.groundColor.set(gold ? 0xa06e52 : 0x67768b);
    box(ground, gold ? 0xc39772 : 0x718a9e, 0, -0.22, -90, 150, 0.3, 210);
    box(ground, gold ? 0xe3bb86 : 0x526678, 0, -0.08, -90, 8.1, 0.18, 210);
    for (const lane of [-1, 0, 1]) {
      if (!gold) {
        box(ground, 0x879a9b, lane * LANE_WIDTH, 0.01, -90, 2.18, 0.04, 210);
        for (const side of [-1, 1])
          box(
            ground,
            0xc6e1df,
            lane * LANE_WIDTH + side * 0.76,
            0.06,
            -90,
            0.09,
            0.1,
            210,
          );
      }
      const ties = new THREE.InstancedMesh(
        boxGeometry,
        material(gold ? 0xf5d8a2 : 0x405468),
        90,
      );
      ground.add(ties);
      sleepers.push(ties);
    }
    for (const side of [-1, 1]) {
      box(
        ground,
        gold ? 0xd2946e : 0x2c596d,
        side * 4.35,
        0.13,
        -90,
        0.5,
        0.35,
        210,
      );
      for (let row = 0; row < 13; row++) {
        const group = new THREE.Group();
        scenery.add(group);
        const offset = row * 14;
        scrolling.push({ group, offset });
        const height = gold ? 3.5 + (row % 3) * 1.1 : 5 + (row % 4) * 2.2;
        const color = gold
          ? [0xd38063, 0xe6b471, 0xefd1a0][row % 3]
          : [0x6e9fa7, 0xb47986, 0x86b7b4, 0xd1b08a][row % 4];
        const x = side * (7.3 + (row % 2) * 0.7);
        box(group, color, x, height / 2, 0, 4.5, height, 9.5);
        box(
          group,
          gold ? 0xb76650 : 0x345d72,
          x,
          height + 0.13,
          0,
          4.8,
          0.3,
          9.7,
        );
        for (let floor = 0; floor < (gold ? 2 : 3); floor++) {
          for (const wx of [-0.95, 0.95])
            box(
              group,
              gold ? 0x417f86 : 0xd4f1db,
              x + wx,
              1.4 + floor * 1.75,
              4.78,
              0.8,
              0.94,
              0.05,
            );
        }
        if (gold) {
          // Palms, parapets and awnings make the second world a different place.
          const awning = box(group, 0x419b95, x, 2.6, 5.1, 4.2, 0.18, 1.3);
          awning.rotation.x = 0.16;
          const trunk = mesh(
            group,
            trunkGeometry,
            0x996b48,
            side * 5.2,
            2.25,
            2,
          );
          trunk.rotation.z = side * 0.08;
          for (let leaf = 0; leaf < 5; leaf++) {
            const frond = mesh(
              group,
              sphereGeometry,
              0x448776,
              side * 5.2,
              4.7,
              2,
              1.8,
              0.12,
              0.5,
            );
            frond.rotation.y = (leaf * Math.PI) / 2.5;
            frond.rotation.z = 0.15;
          }
        } else {
          box(group, 0x294f66, side * 4.7, 1.25, 3, 0.09, 2.5, 0.09);
          box(group, 0xfbd490, side * 4.7, 2.6, 3, 0.38, 0.22, 0.38);
          if (row % 3 === 0)
            sign(
              group,
              side < 0 ? "NOVA" : "ARCADE",
              "#baf6e6",
              x,
              3,
              4.9,
              3.8,
            );
        }
      }
    }
    for (let i = 0; i < 3; i++) {
      const arch = new THREE.Group();
      scenery.add(arch);
      scrolling.push({ group: arch, offset: i * 65 + 40 });
      const color = gold ? 0xbc7758 : 0x446879;
      box(arch, color, -4.9, 3.8, 0, 0.4, 7.6, 0.4);
      box(arch, color, 4.9, 3.8, 0, 0.4, 7.6, 0.4);
      box(arch, color, 0, 7.4, 0, 10, 0.6, gold ? 1.5 : 0.5);
      sign(
        arch,
        gold ? "GOLDEN MILE" : "NOVA EXPRESS",
        gold ? "#ffe3a1" : "#7cf0df",
        0,
        7.4,
        0.8,
        5.2,
      );
    }
    const sun = mesh(
      scenery,
      sphereGeometry,
      gold ? 0xffe5af : 0xe8f3d4,
      -28,
      26,
      -135,
      8,
      8,
      4,
    );
    sun.name = "sun";
  }
  const avatar = new THREE.Group();
  avatar.name = "avatar";
  scene.add(avatar);
  const rig = new THREE.Group();
  rig.name = "standing-runner";
  avatar.add(rig);
  const roll = new THREE.Group();
  roll.name = "rolling-runner";
  avatar.add(roll);
  let limbs: THREE.Group[] = [];
  function makeAvatar(skin: RunnerSkin) {
    rig.clear();
    roll.clear();
    limbs = [];
    const p = PALETTES[skin];
    // A tucked silhouette stays inside the roll clearance for every rotation.
    mesh(roll, sphereGeometry, p.jacket, 0, 0, 0, 0.43, 0.4, 0.43);
    mesh(roll, sphereGeometry, p.face, 0, 0.2, -0.17, 0.23, 0.22, 0.2);
    box(roll, p.accent, 0, 0.08, 0.35, 0.35, 0.32, 0.15);
    for (const side of [-1, 1])
      box(roll, p.dark, side * 0.21, -0.25, -0.18, 0.22, 0.18, 0.32);
    mesh(rig, sphereGeometry, p.jacket, 0, 1.12, 0, 0.39, 0.48, 0.3);
    box(rig, p.dark, 0, 0.77, 0, 0.55, 0.2, 0.38);
    // The rear-facing hood, backpack and soles establish forward orientation.
    mesh(rig, sphereGeometry, p.face, 0, 1.81, 0, 0.33, 0.34, 0.3);
    mesh(rig, sphereGeometry, p.jacket, 0, 1.91, 0.09, 0.37, 0.31, 0.27);
    box(rig, p.dark, 0, 1.93, -0.19, 0.65, 0.13, 0.3);
    box(rig, p.accent, 0, 1.14, 0.29, 0.46, 0.47, 0.2);
    box(rig, 0xfff1d3, 0, 1.17, 0.405, 0.14, 0.08, 0.02);
    if (skin === "moss") {
      for (const side of [-1, 1]) {
        const ear = mesh(
          rig,
          coneGeometry,
          p.dark,
          side * 0.25,
          2.22,
          0.03,
          0.15,
          0.3,
          0.15,
        );
        ear.rotation.z = side * -0.25;
      }
    } else if (skin === "ember") {
      mesh(rig, sphereGeometry, p.accent, 0, 2.22, 0.04, 0.15, 0.15, 0.15);
      box(rig, p.accent, 0, 1.55, 0.25, 0.68, 0.13, 0.15);
    }
    for (const side of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(side * 0.18, 0.77, 0);
      rig.add(leg);
      box(leg, p.dark, 0, -0.27, 0, 0.21, 0.55, 0.24);
      box(leg, p.accent, 0, -0.59, -0.06, 0.28, 0.2, 0.44);
      box(leg, 0xf6efde, 0, -0.69, -0.06, 0.29, 0.065, 0.45);
      limbs.push(leg);
    }
    for (const side of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(side * 0.36, 1.4, 0);
      rig.add(arm);
      box(arm, p.jacket, 0, -0.2, 0, 0.2, 0.46, 0.23);
      mesh(arm, sphereGeometry, p.face, 0, -0.46, 0, 0.12, 0.13, 0.12);
      limbs.push(arm);
    }
  }
  const shadow = mesh(
    scene,
    discGeometry,
    0x536276,
    0,
    0.025,
    0,
    0.65,
    0.38,
    1,
  );
  shadow.rotation.x = -Math.PI / 2;
  const obstacleModels = new Map<
    number,
    { group: THREE.Group; kind: string }
  >();
  function makeObstacle(kind: string, world: RunnerWorld) {
    const group = new THREE.Group();
    group.name = `obstacle-${kind}`;
    if (kind === "coin") {
      const coin = mesh(group, coinGeometry, 0xffcd3d, 0, 0.95, 0);
      coin.rotation.x = Math.PI / 2;
      const stamp = mesh(
        group,
        discGeometry,
        0xffe98a,
        0,
        0.95,
        0.065,
        0.19,
        0.19,
        1,
      );
      stamp.rotation.z = Math.PI / 4;
    } else if (kind === "barrier") {
      box(group, 0xf27760, 0, 0.4, 0, 1.75, 0.8, 0.55);
      box(group, 0xffe6b3, 0, 0.7, 0.29, 1.73, 0.16, 0.035);
      for (const x of [-0.52, 0, 0.52]) {
        const stripe = box(group, 0xfff5d9, x, 0.39, 0.29, 0.18, 0.53, 0.035);
        stripe.rotation.z = -0.5;
      }
    } else if (kind === "overhead") {
      for (const x of [-0.9, 0.9])
        box(group, 0x37516c, x, 1.2, 0, 0.17, 2.4, 0.4);
      box(group, 0x7c6fbb, 0, 1.85, 0, 1.95, 1.1, 0.55);
      box(group, 0xf6d878, 0, 1.48, 0.3, 1.93, 0.15, 0.04);
      for (const x of [-0.45, 0, 0.45]) {
        const arrow = mesh(
          group,
          coneGeometry,
          0xf6f0d1,
          x,
          1.96,
          0.31,
          0.17,
          0.25,
          0.06,
        );
        arrow.rotation.z = Math.PI;
      }
    } else {
      box(group, 0x2f4358, 0, 0.17, 0, 1.85, 0.3, 7);
      box(
        group,
        world === "gold" ? 0xbb7854 : 0x338b9f,
        0,
        1.43,
        0,
        1.9,
        2.5,
        7,
      );
      box(group, 0xd3ece0, 0, 2.72, 0, 1.94, 0.2, 7.2);
      box(group, 0x29495c, 0, 2, 3.615, 1.55, 0.66, 0.04);
      box(group, 0xffe5a8, 0, 0.63, 3.63, 1.6, 0.13, 0.05);
      for (const x of [-0.62, 0.62])
        mesh(group, sphereGeometry, 0xfff1c8, x, 1, 3.64, 0.12, 0.12, 0.04);
    }
    scene.add(group);
    return group;
  }
  const sparkles = new THREE.Group();
  sparkles.name = "coin-burst";
  scene.add(sparkles);
  for (let i = 0; i < 12; i++)
    mesh(sparkles, sphereGeometry, 0xffd552, 0, 0, 0, 0.06, 0.06, 0.06);
  let world: RunnerWorld | null = null;
  let skin: RunnerSkin | null = null;
  let width = 0,
    height = 0,
    lastCoins = 0,
    lastHits = 0,
    coinAt = -1000,
    hitAt = -1000;
  let disposed = false;
  function render(
    state: RunnerState,
    nextWorld: RunnerWorld = state.options.variant,
    nextSkin: RunnerSkin = "nova",
  ) {
    if (disposed) return;
    if (nextWorld !== world) {
      makeWorld(nextWorld);
      world = nextWorld;
      for (const model of obstacleModels.values()) scene.remove(model.group);
      obstacleModels.clear();
    }
    if (nextSkin !== skin) {
      makeAvatar(nextSkin);
      skin = nextSkin;
    }
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width || canvas.clientWidth || 960));
    const h = Math.max(
      1,
      Math.round(rect.height || canvas.clientHeight || 600),
    );
    if (w !== width || h !== height) {
      width = w;
      height = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.fov = camera.aspect < 0.8 ? 66 : 56;
      camera.position.set(
        0,
        camera.aspect < 0.8 ? 5.1 : 4.4,
        camera.aspect < 0.8 ? 10.8 : 8.2,
      );
      camera.lookAt(0, 1.1, -15);
      camera.updateProjectionMatrix();
    }
    for (const item of scrolling)
      item.group.position.z =
        9 - ((item.offset + 182 - (state.distance % 182)) % 182);
    for (let lane = 0; lane < sleepers.length; lane++) {
      const ties = sleepers[lane];
      for (let i = 0; i < 90; i++) {
        matrix.makeScale(
          world === "gold" ? 0.09 : 1.9,
          0.035,
          world === "gold" ? 0.7 : 0.22,
        );
        matrix.setPosition(
          (lane - 1) * LANE_WIDTH + (world === "gold" ? 1.22 : 0),
          0.025,
          8 - i * 2.15 + (state.distance % 2.15),
        );
        ties.setMatrixAt(i, matrix);
      }
      ties.instanceMatrix.needsUpdate = true;
    }
    const time = state.elapsedMs / 1000;
    if (
      state.phase === "ready" ||
      state.coins < lastCoins ||
      state.hits < lastHits
    ) {
      coinAt = -1000;
      hitAt = -1000;
    }
    const running = state.phase !== "ready" && state.phase !== "results";
    avatar.position.set(state.avatarX * LANE_WIDTH, state.jumpHeight, 0);
    rig.visible = !state.duck;
    roll.visible = state.duck;
    roll.position.y = 0.48;
    roll.rotation.x = -time * 8;
    rig.position.y = state.duck
      ? 0.43
      : 0.04 + (running ? Math.abs(Math.sin(time * 10)) * 0.07 : 0);
    rig.rotation.set(state.duck ? -Math.PI / 2 : -0.08, 0, 0);
    rig.scale.setScalar(state.duck ? 0.82 : 1);
    limbs.forEach((limb, i) => {
      limb.rotation.x =
        state.jumpHeight > 0.1
          ? i < 2
            ? -0.55
            : -1.5
          : running
            ? Math.sin(time * 10 + (i % 2) * Math.PI) * (i < 2 ? 0.7 : -0.65)
            : 0;
    });
    shadow.position.x = avatar.position.x;
    shadow.scale.set(
      0.65 - state.jumpHeight * 0.1,
      0.38 - state.jumpHeight * 0.04,
      1,
    );
    const ids = new Set<number>();
    for (const obstacle of state.obstacles) {
      if (obstacle.z > 150 || obstacle.z < -4) continue;
      ids.add(obstacle.id);
      let model = obstacleModels.get(obstacle.id);
      if (!model || model.kind !== obstacle.kind) {
        if (model) scene.remove(model.group);
        model = {
          group: makeObstacle(obstacle.kind, world),
          kind: obstacle.kind,
        };
        obstacleModels.set(obstacle.id, model);
      }
      model.group.position.set(obstacle.lane * LANE_WIDTH, 0, -obstacle.z);
      if (obstacle.kind === "coin") model.group.rotation.y = time * 2.5;
    }
    for (const [id, model] of obstacleModels)
      if (!ids.has(id)) {
        scene.remove(model.group);
        obstacleModels.delete(id);
      }
    if (state.coins > lastCoins) coinAt = time;
    if (state.hits > lastHits) hitAt = time;
    lastCoins = state.coins;
    lastHits = state.hits;
    const burst = time - coinAt;
    sparkles.visible = burst >= 0 && burst < 0.45;
    sparkles.position.set(avatar.position.x, 0.9 + state.jumpHeight, 0);
    sparkles.children.forEach((particle, i) =>
      particle.position.set(
        Math.cos((i * Math.PI) / 6) * burst * 2,
        Math.sin((i * Math.PI) / 6) * burst * 2 + burst,
        Math.sin(i * 3) * burst,
      ),
    );
    avatar.visible = time - hitAt > 0.7 || Math.floor(time * 16) % 2 === 0;
    renderer.render(scene, camera);
  }
  return {
    render,
    dispose() {
      disposed = true;
      for (const ties of sleepers) ties.dispose();
      for (const value of signMaterials.values()) value.dispose();
      for (const value of geometries) value.dispose();
      for (const value of materials.values()) value.dispose();
      for (const value of textures) value.dispose();
      renderer.dispose();
    },
  };
}
