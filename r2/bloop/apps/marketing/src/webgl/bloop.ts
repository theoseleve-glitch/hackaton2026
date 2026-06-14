import * as THREE from 'three';
import vert from './shaders/fullscreen.vert?raw';
import frag from './shaders/metaball.frag?raw';

export interface Blob { x: number; y: number; r: number }

export class BloopScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private cam = new THREE.Camera();
  private mat: THREE.ShaderMaterial;
  private mouse = new THREE.Vector2(0, 0);
  private targetMouse = new THREE.Vector2(0, 0);
  private raf = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, transparent: true,
      uniforms: {
        uResolution: { value: new THREE.Vector2() },
        uTime: { value: 0 }, uMouse: { value: this.mouse },
        uBlobCount: { value: 1 },
        uBlobs: { value: Array.from({ length: 8 }, () => new THREE.Vector3(0, 0, 0)) },
      },
    });
    (this.mat.uniforms.uBlobs.value as THREE.Vector3[])[0].set(0, 0, 0.55);
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat));
    this.resize();
    addEventListener('resize', this.resize);
    addEventListener('mousemove', (e) =>
      this.targetMouse.set((e.clientX / innerWidth) * 2 - 1, -((e.clientY / innerHeight) * 2 - 1)));
    this.loop(0);
  }
  private resize = () => {
    this.renderer.setSize(innerWidth, innerHeight, false);
    (this.mat.uniforms.uResolution.value as THREE.Vector2).set(innerWidth, innerHeight);
  };
  setBlobs(blobs: Blob[]) {
    const arr = this.mat.uniforms.uBlobs.value as THREE.Vector3[];
    blobs.slice(0, 8).forEach((b, i) => arr[i].set(b.x, b.y, b.r));
    this.mat.uniforms.uBlobCount.value = Math.min(blobs.length, 8);
  }
  private loop = (ms: number) => {
    this.raf = requestAnimationFrame(this.loop);
    if (document.hidden) return;
    this.mouse.lerp(this.targetMouse, 0.08);
    this.mat.uniforms.uTime.value = ms / 1000;
    this.renderer.render(this.scene, this.cam);
  };
  dispose() { cancelAnimationFrame(this.raf); this.renderer.dispose(); }
}
