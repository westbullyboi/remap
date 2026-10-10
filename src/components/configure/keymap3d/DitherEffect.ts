import { Effect } from 'postprocessing';
import * as THREE from 'three';

const fragmentShader = `
uniform vec3 colorLight;
uniform vec3 colorDark;

float getBayer(vec2 p) {
    int x = int(mod(p.x, 4.0));
    int y = int(mod(p.y, 4.0));
    
    if (x == 0 && y == 0) return 0.0/16.0;
    if (x == 1 && y == 0) return 8.0/16.0;
    if (x == 2 && y == 0) return 2.0/16.0;
    if (x == 3 && y == 0) return 10.0/16.0;
    
    if (x == 0 && y == 1) return 12.0/16.0;
    if (x == 1 && y == 1) return 4.0/16.0;
    if (x == 2 && y == 1) return 14.0/16.0;
    if (x == 3 && y == 1) return 6.0/16.0;
    
    if (x == 0 && y == 2) return 3.0/16.0;
    if (x == 1 && y == 2) return 11.0/16.0;
    if (x == 2 && y == 2) return 1.0/16.0;
    if (x == 3 && y == 2) return 9.0/16.0;
    
    if (x == 0 && y == 3) return 15.0/16.0;
    if (x == 1 && y == 3) return 7.0/16.0;
    if (x == 2 && y == 3) return 13.0/16.0;
    if (x == 3 && y == 3) return 5.0/16.0;
    
    return 0.0;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    // 1. Calculate luminance from original color
    float luminance = dot(inputColor.rgb, vec3(0.299, 0.587, 0.114));
    
    // 2. Get threshold from Bayer matrix using screen coordinates
    float threshold = getBayer(gl_FragCoord.xy);
    
    // 3. Threshold to binary color
    vec3 finalColor = luminance < threshold ? colorDark : colorLight;
    
    // Optional: Preserve transparency if background is empty
    if (inputColor.a < 0.1) {
        outputColor = vec4(0.0, 0.0, 0.0, 0.0);
    } else {
        outputColor = vec4(finalColor, 1.0);
    }
}
`;

export class DitherEffect extends Effect {
  constructor() {
    super('DitherEffect', fragmentShader, {
      uniforms: new Map([
        ['colorLight', new THREE.Uniform(new THREE.Color('#ff3333'))], // Red
        ['colorDark', new THREE.Uniform(new THREE.Color('#111111'))], // Dark
      ]),
    });
  }
}
