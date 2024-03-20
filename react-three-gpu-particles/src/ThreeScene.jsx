import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { GPUParticleSystem } from './GPUParticleSystem.ts';

const MyThreeJSComponent = () => {
  const containerRef = useRef(null);
  const requestRef = useRef();
  const particleSystemRef = useRef();
  const clock = useRef(new THREE.Clock(false));
  const cubeRef = useRef();
  let tick = 0;

  useEffect(() => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, window.innerWidth / window.innerHeight, 1, 10000);
    camera.position.z = 100;
    scene.background = new THREE.Color(0x000000);

    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    containerRef.current.appendChild(renderer.domElement);

    particleSystemRef.current = new GPUParticleSystem({
      maxParticles: 500000,
    });
    scene.add(particleSystemRef.current);

    const geometry = new THREE.BoxGeometry(10, 10, 10);
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const cube = new THREE.Mesh(geometry, material);
    cubeRef.current = cube;
    scene.add(cube);

    const animate = () => {
      requestRef.current = requestAnimationFrame(animate);
      const delta = clock.current.getDelta();
      tick += delta;
      if (tick < 0) tick = 0;
        // Adjust this value to spawn more particles per frame
        const particlesPerFrame = 10000;

        for (let i = 0; i < particlesPerFrame; i++) {
        // Generate random position for each particle
        const position = new THREE.Vector3(
            (Math.random() * 2 - 1) * 20, 
            (Math.random() * 2 - 1) * 20, 
            (Math.random() * 2 - 1) * 20
        );

        // Setup particle options with the random position
        const options = {
            position: position,
            positionRandomness: .3,
            velocity: new THREE.Vector3(0,5,0),
            color: "#FFFFFF",
            colorRandomness: .2,
            turbulence: .5,
            lifetime: 200,
            size: 2,
            sizeRandomness: 2
        };

        // Spawn the particle
        particleSystemRef.current.spawnParticle(options);
        }
        particleSystemRef.current.update(tick);
              // Update cube rotation
        if (cubeRef.current) {
          cubeRef.current.rotation.x += 0.02;
          cubeRef.current.rotation.y += 0.02;
        }
        renderer.render(scene, camera);
    };

    clock.current.start();
    animate();

    const onWindowResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onWindowResize, false);

    return () => {
      window.removeEventListener('resize', onWindowResize, false);
      cancelAnimationFrame(requestRef.current);
      renderer.dispose();
      containerRef.current.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={containerRef} />;
};

export default MyThreeJSComponent;
