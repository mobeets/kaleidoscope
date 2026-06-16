function TorusKnotShape()
{
	var material = new THREE.MeshPhongMaterial({color:0x993300, specular:0xffff00, shading:THREE.FlatShading, side:THREE.DoubleSide});
	material.color.setHSL(1.0,0.5,0.5);
	material.specular.setHSL(0.5,1.0,0.1);
	material.shininess = 30;

	this.paletteOffset = 0;
	this.satVariance = 0.7 + Math.random() * 0.3;

	var torus = {radius:1, tubeSize:0.5, tubularSegments:50, radialSegments:30, p:4, q:16};
	var torusGeo = new THREE.TorusKnotGeometry( torus.radius, torus.tubeSize, torus.tubularSegments, torus.radialSegments, torus.p, torus.q );

	this.mesh = new THREE.Mesh(torusGeo, material);
	this.mesh.rotation.x = Math.random() * Math.PI*2;
	this.mesh.rotation.y = Math.random() * Math.PI*2;
	this.mesh.rotation.z = Math.random() * Math.PI*2;

	var rotSpeedX = Math.random() / 400;
	var rotSpeedY = Math.random() / 400;
	var rotSpeedZ = Math.random() / 400;

	if (Math.random() > 0.5) {rotSpeedX = -rotSpeedX};
	if (Math.random() > 0.5) {rotSpeedY = -rotSpeedX};
	if (Math.random() > 0.5) {rotSpeedZ = -rotSpeedX};

	var oscX = Math.random() * Math.PI*2;
	var oscY = Math.random() * Math.PI*2;
	var oscZ = Math.random() * Math.PI*2;

	oscXSpeed = Math.random() * 0.003;
	oscYSpeed = Math.random() * 0.003;
	oscZSpeed = Math.random() * 0.003;

	this.update = function()
	{
		this.updatePosition();
		this.updateColor();
	}

	this.updatePosition = function()
	{
		this.mesh.rotation.x += rotSpeedX * speed;
		this.mesh.rotation.y += rotSpeedY * speed;

		oscX += oscXSpeed * speed;
		oscY += oscYSpeed * speed;
		oscZ += oscZSpeed * speed;

		this.mesh.position.x = Math.cos(oscX) * 1;
		this.mesh.position.y = Math.sin(oscY) * 1;
	}

	this.updateColor = function()
	{
		var h = ((paletteHue + this.paletteOffset) % 1.0 + 1.0) % 1.0;
		var specH = (h + 0.5) % 1.0;
		material.color.setHSL(h, 0.75 * saturation * this.satVariance, 0.35 * lightness);
		material.specular.setHSL(specH, saturation, 0.4 * lightness);
	}

	this.randomizeColor = function()
	{
		this.satVariance = 0.7 + Math.random() * 0.3;
		this.updateColor();
	}
}
