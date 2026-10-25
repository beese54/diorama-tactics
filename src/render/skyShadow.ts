import type * as THREE from 'three';

/**
 * Lets the sun's shadow dim the sky light too. On its own a shadow only takes away direct
 * sun, which is little on flat ground when the sun is low, so long dawn and dusk shadows
 * vanished. With this they show at any sun angle, as a gentle darkening, by `uSkyShadow`
 * (0 = only the sun is blocked, 1 = the sky light is blocked fully too).
 */
const SKY_SHADOW = /* glsl */ `
  #include <lights_fragment_end>
  #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
    {
      DirectionalLightShadow sky = directionalLightShadows[ 0 ];
      float lit = getShadow( directionalShadowMap[ 0 ], sky.shadowMapSize, 1.0, sky.shadowBias, sky.shadowRadius, vDirectionalShadowCoord[ 0 ] );
      reflectedLight.indirectDiffuse *= mix( 1.0, lit, uSkyShadow );
    }
  #endif
`;

/** Adds the sky shadow to a Lambert material's shader in onBeforeCompile; `strength` is shared and set each frame. */
export function addSkyShadow(shader: THREE.WebGLProgramParametersWithUniforms, strength: { value: number }): void {
  shader.uniforms.uSkyShadow = strength;
  shader.fragmentShader = 'uniform float uSkyShadow;\n' + shader.fragmentShader.replace('#include <lights_fragment_end>', SKY_SHADOW);
}

/** One strength for every material, set by LightRig through main each frame. */
export const skyShadow = { value: 0 };
