import * as THREE from 'three';

interface GPUParticleSystemOptions {
  maxParticles?: number;
  containerCount?: number;
  particleNoiseTex?: string;
  particleSpriteTex?: string;
}

class GPUParticleSystem extends THREE.Object3D {
  PARTICLE_COUNT: number;
  PARTICLE_CONTAINERS: number;
  PARTICLE_NOISE_TEXTURE: string;
  PARTICLE_SPRITE_TEXTURE: string;
  PARTICLES_PER_CONTAINER: number;
  PARTICLE_CURSOR: number;
  time: number;
  textureLoader: THREE.TextureLoader;
  particleNoiseTex: THREE.Texture;
  particleSpriteTex: THREE.Texture;
  particleShaderMat: THREE.ShaderMaterial;
  particleContainers: GPUParticleContainer[];

  constructor({
    maxParticles = 1000000,
    containerCount = 1,
    particleNoiseTex = '/textures/perlin.png',
    particleSpriteTex = '/textures/particle2.png'
  }: GPUParticleSystemOptions = {}) {
    super();
    this.PARTICLE_COUNT = maxParticles;
    this.PARTICLE_CONTAINERS = containerCount;
    this.PARTICLE_NOISE_TEXTURE = particleNoiseTex;
    this.PARTICLE_SPRITE_TEXTURE = particleSpriteTex;
    this.PARTICLES_PER_CONTAINER = Math.ceil(this.PARTICLE_COUNT / this.PARTICLE_CONTAINERS);
    this.PARTICLE_CURSOR = 0;
    this.time = 0;

    this.textureLoader = new THREE.TextureLoader();
    this.particleNoiseTex = this.textureLoader.load(this.PARTICLE_NOISE_TEXTURE, texture => {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    });
    this.particleSpriteTex = this.textureLoader.load(this.PARTICLE_SPRITE_TEXTURE, texture => {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    });

    this.init();
  }

  init(): void {
    this.particleShaderMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        "uTime": { value: 0.0 },
        "uScale": { value: 1.0 },
        "tNoise": { value: this.particleNoiseTex },
        "tSprite": { value: this.particleSpriteTex }
      },
      blending: THREE.AdditiveBlending,
      vertexShader: GPUParticleShader.vertexShader,
      fragmentShader: GPUParticleShader.fragmentShader
    });

    this.particleContainers = Array.from({ length: this.PARTICLE_CONTAINERS }, () => {
      const container = new GPUParticleContainer(this.PARTICLES_PER_CONTAINER, this);
      this.add(container);
      return container;
    });
  }

  spawnParticle(options: ParticleOptions): void { // "options" type should be defined based on the structure of the options object
    const containerIndex = this.PARTICLE_CURSOR++ % this.PARTICLE_CONTAINERS;
    this.particleContainers[containerIndex].spawnParticle(options);
  }

  update(time: number): void {
    this.particleContainers.forEach(container => container.update(time));
  }
}


var GPUParticleShader = {

	vertexShader: `precision highp float;
	const vec4 bitSh = vec4(256.0 * 256.0 * 256.0, 256.0 * 256.0, 256.0, 1.0);
	const vec4 bitMsk = vec4(0.0, vec3(1.0 / 256.0));
	const vec4 bitShifts = vec4(1.0) / bitSh;
	#define FLOAT_MAX 1.70141184e38
	#define FLOAT_MIN 1.17549435e-38
	lowp vec4 encode_float(highp float v) {
	  highp float av = abs(v);
	  if(av < FLOAT_MIN) {
		return vec4(0.0, 0.0, 0.0, 0.0);
	  } else if(v > FLOAT_MAX) {
		return vec4(127.0, 128.0, 0.0, 0.0) / 255.0;
	  } else if(v < -FLOAT_MAX) {
		return vec4(255.0, 128.0, 0.0, 0.0) / 255.0;
	  }
	  highp vec4 c = vec4(0,0,0,0);
	  highp float e = floor(log2(av));
	  highp float m = av * pow(2.0, -e) - 1.0;
	  c[1] = floor(128.0 * m);
	  m -= c[1] / 128.0;
	  c[2] = floor(32768.0 * m);
	  m -= c[2] / 32768.0;
	  c[3] = floor(8388608.0 * m);
	  highp float ebias = e + 127.0;
	  c[0] = floor(ebias / 2.0);
	  ebias -= c[0] * 2.0;
	  c[1] += floor(ebias) * 128.0;
	  c[0] += 128.0 * step(0.0, -v);
	  return c / 255.0;
	}
	uniform float uTime;
	uniform float uScale;
	uniform sampler2D tNoise;
	attribute vec4 particlePositionsStartTime;
	attribute vec4 particleVelColSizeLife;
	attribute vec3 particleVelocity;
	attribute float particleTurbulence;
	varying vec4 vColor;
	varying float lifeLeft;
	void main() {
	  vColor = encode_float(particleVelColSizeLife.y);
	  vec3 velocity = particleVelocity;
	  float turbulence = particleTurbulence;
	  vec3 newPosition;
	  float timeElapsed = uTime - particlePositionsStartTime.a;
	  lifeLeft = 1.0 - (timeElapsed / particleVelColSizeLife.w);
	  gl_PointSize = (uScale * particleVelColSizeLife.z) * lifeLeft;
	  newPosition = particlePositionsStartTime.xyz + (velocity * 10.0) * (uTime - particlePositionsStartTime.a);
	  vec3 noise = texture2D(tNoise, vec2(newPosition.x * 0.015 + (uTime * 0.05), newPosition.y * 0.02 + (uTime * 0.015))).rgb;
	  vec3 noiseVel = (noise.rgb - 0.5) * 30.0;
	  newPosition = mix(newPosition, newPosition + vec3(noiseVel * (turbulence * 5.0)), (timeElapsed / particleVelColSizeLife.a));
	  if(velocity.y > 0.0 && velocity.y < 0.05) {
		lifeLeft = 0.0;
	  }
	  if(velocity.x < -1.45) {
		lifeLeft = 0.0;
	  }
	  if(timeElapsed > 0.0) {
		gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
	  } else {
		gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
		lifeLeft = 0.0;
		gl_PointSize = 0.0;
	  }
	}`,

	fragmentShader: `precision highp float;
	varying vec4 vColor;
	varying float lifeLeft;
	uniform sampler2D tSprite;

	float scaleLinear(float value, vec2 valueDomain) {
		return (value - valueDomain.x) / (valueDomain.y - valueDomain.x);
	}

	float scaleLinear(float value, vec2 valueDomain, vec2 valueRange) {
		return mix(valueRange.x, valueRange.y, scaleLinear(value, valueDomain));
	}

	void main() {
		float alpha = 0.0;

		if(lifeLeft > 0.995) {
			alpha = scaleLinear(lifeLeft, vec2(1.0, 0.995), vec2(0.0, 1.0));
		} else {
			alpha = lifeLeft * 0.75;
		}

		vec4 tex = texture2D(tSprite, gl_PointCoord);
		gl_FragColor = vec4(vColor.rgb * tex.a, 1.0);
	}
`
};

interface ParticleOptions {
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    positionRandomness: number;
    velocityRandomness: number;
    color: string;
    colorRandomness: number;
    turbulence: number;
    lifetime: number;
    size: number;
    sizeRandomness: number;
    smoothPosition: boolean;
    i: number;
}

class GPUParticleContainer extends THREE.Object3D {
    PARTICLE_COUNT: number;
    PARTICLE_CURSOR: number;
    time: number;
    DPR: number;
    GPUParticleSystem: GPUParticleSystem;
	particleSystem: THREE.Points;
    options: ParticleOptions;
    offset: number;
    count: number;
    rand: number[];
    i: number;
	particleShaderGeo: THREE.BufferGeometry;
    particleVertices: Float32Array;
    particlePositionsStartTime: Float32Array;
    particleVelocity: Float32Array;
    particleTurbulence: Float32Array;
    particleVelColSizeLife: Float32Array;
    posStart: THREE.BufferAttribute;
    velCol: THREE.BufferAttribute;
    velocityAttr: THREE.BufferAttribute;
    turbulenceAttr: THREE.BufferAttribute;
	particleShaderMat: THREE.ShaderMaterial;
	particleUpdate: boolean;

    constructor(maxParticles: number = 500000, particleSystem: GPUParticleSystem) {
        super();
        this.PARTICLE_COUNT = maxParticles;
        this.PARTICLE_CURSOR = 0; // Adjusted to start from 0 for consistency
        this.time = 0;
        this.DPR = window.devicePixelRatio;
        this.GPUParticleSystem = particleSystem; // Standardized naming convention
        this.options = {
            position: new THREE.Vector3(0, 2, 0),
            velocity: new THREE.Vector3(0, 5, 0),
            positionRandomness: 40,
            velocityRandomness: 0.5,
            color: "#FFFFFF",
            colorRandomness: 100,
            turbulence: 0,
            lifetime: 100,
            size: 2,
            sizeRandomness: 5,
            smoothPosition: false,
            i: 0,
        };
        this.offset = 0;
        this.count = 0;

        // Initialize random array efficiently
        this.rand = Array.from({ length: 1e5 }, () => Math.random() - 0.5);

        this.i = 0; // Ensure this.i is defined

        this.initializeGeometry();
        this.init();
    }

    decodeFloat(x: number, y: number, z: number, w: number): number {
        // Create a buffer for 4 bytes (32 bits)
        const buffer = new ArrayBuffer(4);

        // Create a view to treat the buffer as an array of 8-bit unsigned integers
        const uint8View = new Uint8Array(buffer);

        // Assign the input values to the view. Each value represents one byte.
        uint8View[0] = Math.floor(w);
        uint8View[1] = Math.floor(z);
        uint8View[2] = Math.floor(y);
        uint8View[3] = Math.floor(x);

        // Create a view to read the buffer as a 32-bit floating point number
        const float32View = new Float32Array(buffer);

        // Return the first (and only) element of the float32 view, which is the decoded floating-point number
        return float32View[0];
    }

	
	initializeGeometry(): void {
		this.particleShaderGeo = new THREE.BufferGeometry();
	
		// Allocate typed arrays for geometry attributes
		this.particleVertices = new Float32Array(this.PARTICLE_COUNT * 3); // x, y, z for each particle
		this.particlePositionsStartTime = new Float32Array(this.PARTICLE_COUNT * 4); // x, y, z, startTime for each particle
		this.particleVelocity = new Float32Array(this.PARTICLE_COUNT * 3); // velocity vector for each particle
		this.particleTurbulence = new Float32Array(this.PARTICLE_COUNT); // turbulence value for each particle
		this.particleVelColSizeLife = new Float32Array(this.PARTICLE_COUNT * 4); // velocity, color, size, lifespan for each particle
	
		// Initialize particles with default values and assign them to the buffer
		for (let i = 0; i < this.PARTICLE_COUNT; i++) {
			const index4 = i * 4;
			const index3 = i * 3;
	
			// Initialize start time and position
			this.particlePositionsStartTime.set([100, 0, 0, 0], index4); // Default start position and time
	
			// Initialize vertices (positions)
			this.particleVertices.set([0, 0, 0], index3); // Default vertex position
	
			// Initialize velocity and color using the decodeFloat utility method
			const encodedVelocity = this.decodeFloat(128, 128, 0, 0); // Placeholder velocity
			const encodedColor = this.decodeFloat(0, 254, 0, 254); // Placeholder color
			this.particleVelColSizeLife.set([encodedVelocity, encodedColor, 1.0, 1.0], index4); // Default velocity, color, size, lifespan
		}
	
		// Assign attributes to geometry
		this.particleShaderGeo.setAttribute('position', new THREE.BufferAttribute(this.particleVertices, 3));
		this.particleShaderGeo.setAttribute('particlePositionsStartTime', new THREE.BufferAttribute(this.particlePositionsStartTime, 4).setUsage(THREE.DynamicDrawUsage));
		this.particleShaderGeo.setAttribute('particleVelColSizeLife', new THREE.BufferAttribute(this.particleVelColSizeLife, 4).setUsage(THREE.DynamicDrawUsage));
		this.particleShaderGeo.setAttribute('particleVelocity', new THREE.BufferAttribute(this.particleVelocity, 3).setUsage(THREE.DynamicDrawUsage));
		this.particleShaderGeo.setAttribute('particleTurbulence', new THREE.BufferAttribute(this.particleTurbulence, 1).setUsage(THREE.DynamicDrawUsage));
	
		// Store references to attributes for easy access
		this.posStart = this.particleShaderGeo.getAttribute('particlePositionsStartTime') as THREE.BufferAttribute;
		this.velCol = this.particleShaderGeo.getAttribute('particleVelColSizeLife') as THREE.BufferAttribute;
		this.velocityAttr = this.particleShaderGeo.getAttribute('particleVelocity') as THREE.BufferAttribute;
		this.turbulenceAttr = this.particleShaderGeo.getAttribute('particleTurbulence') as THREE.BufferAttribute;
	
		// Reuse the particle system's shader material
		this.particleShaderMat = this.GPUParticleSystem.particleShaderMat;
	}
	
	init(): void {
		this.particleSystem = new THREE.Points(this.particleShaderGeo, this.particleShaderMat as any);
		this.particleSystem.frustumCulled = false;
		this.add(this.particleSystem);
	}
	
	random(): number {
		return ++this.i >= this.rand.length ? this.rand[this.i = 1] : this.rand[this.i];
	}
	

	spawnParticle(options: ParticleOptions): void {
		// Merge provided options with default options
		const opts: ParticleOptions = { ...this.options, ...options };
	
		const {
		  position = new THREE.Vector3(),
		  velocity = new THREE.Vector3(),
		  positionRandomness = 0.0,
		  velocityRandomness = 0.0,
		  color = '#FFFFFF',
		  colorRandomness = 1.0, // Consider removing if not needed
		  turbulence = 1.0,
		  lifetime = 5.0,
		  size = 1,
		  sizeRandomness = 0.0,
		  smoothPosition = false,
		} = opts;
	
		// Adjust size based on device pixel ratio
		const finalSize = this.DPR ? size * this.DPR : size;
	
		// Calculate particle properties
		const i = this.PARTICLE_CURSOR;
		const randomFactor = (): number => this.random(); // Encapsulate randomness for readability
		const packedColor = parseInt(color.replace(/^#/, ''), 16); // Convert hex color to integer
	
		// Assign particle attributes
		const basePosition = position.clone().addScalar(positionRandomness * randomFactor());
		const baseVelocity = velocity.clone().addScalar(velocityRandomness * randomFactor());
	
		if (smoothPosition) {
		  basePosition.sub(velocity.clone().multiplyScalar(randomFactor()));
		}
	
		// Set particle attribute arrays
		this.posStart.array.set([basePosition.x, basePosition.y, basePosition.z, this.time + (2e-2 * randomFactor())], i * 4);
		this.velocityAttr.array.set([baseVelocity.x, baseVelocity.y, baseVelocity.z], i * 3);
		this.turbulenceAttr.array[i] = turbulence;
		this.velCol.array.set([packedColor, finalSize + (sizeRandomness * randomFactor()), lifetime], i * 4 + 1);
	
		// Update counters and flags
		this.offset = this.offset || this.PARTICLE_CURSOR;
		this.count++;
		this.PARTICLE_CURSOR = (this.PARTICLE_CURSOR + 1) % this.PARTICLE_COUNT;
		this.particleUpdate = true;
	  }

	update (time) {

		this.time = time;
		this.particleShaderMat.uniforms['uTime'].value = time;

		this.geometryUpdate();

	};

	geometryUpdate () {
		if (this.particleUpdate == true) {
			this.particleUpdate = false;

			// if we can get away with a partial buffer update, do so
			if (this.offset + this.count < this.PARTICLE_COUNT) {
				this.posStart.updateRange.offset = this.velCol.updateRange.offset = this.offset * 4;
				this.posStart.updateRange.count = this.velCol.updateRange.count = this.count * 4;
			} else {
				this.posStart.updateRange.offset = 0;
				this.posStart.updateRange.count = this.velCol.updateRange.count = (this.PARTICLE_COUNT * 4);
			}

			this.posStart.needsUpdate = true;
			this.velCol.needsUpdate = true;
			this.velocityAttr.needsUpdate = true;
			this.turbulenceAttr.needsUpdate = true;

			this.offset = 0;
			this.count = 0;
		}
	};
};

export { GPUParticleSystem, GPUParticleContainer };