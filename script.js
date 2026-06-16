// new comment


var stats = new Stats();
stats.showPanel( 0 ); // 0: fps, 1: ms, 2: mb, 3+: custom
// document.body.appendChild( stats.dom );


var bufferSize = 1024;
var bufferWidth = bufferSize;
var bufferHeight = bufferSize;

var showTexture = false;
var speed = 0.5;
var saturation = 1.0;
var lightness = 1.0;
var isPaused = false;
var shapeZoom = 2.2;

var autoZoom = true;
var autoZoomSpeed = 0.03;
var autoZoomMin = 0.3;
var autoZoomMax = 1.6;
let startZoomPhase = Math.PI;
var zoomPhase = startZoomPhase;
var lastUpdateTime = null;

var autoRotate = false;
var autoRotateWait = 4.0;
var autoRotateDuration = 1.0;
var autoRotateStep = 90;
var _rotatePhase = 'waiting';
var _rotateTimer = 0;
var _rotateFrom = 0;
var _rotateTo = 0;
var _rotateProgress = 0;

var micEnabled = false;
var micSensitivity = 5.0;
var micBeatThreshold = 1.5; // spike must be this many times above baseline
var micBeatCooldown = 0.25; // minimum seconds between beats
var micBeatDivisor = 32;
var _micAudioContext = null;
var _micAnalyser = null;
var _micDataArray = null;
var _micStream = null;
var _micSlowAmp = 0;
var _lastBeatTime = 0;
var _beatInterval = 1.0;

function getMicAmplitude() {
    if (!_micAnalyser) return 0;
    _micAnalyser.getByteTimeDomainData(_micDataArray);
    var sum = 0;
    for (var i = 0; i < _micDataArray.length; i++) {
        var v = (_micDataArray[i] - 128) / 128;
        sum += v * v;
    }
    return Math.sqrt(sum / _micDataArray.length);
}

function startMic() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('Mic requires a secure context (localhost or HTTPS). Open via a local server, not file://.');
        micEnabled = false;
        return;
    }
    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        .then(function(stream) {
            _micStream = stream;
            _micAudioContext = new (window.AudioContext || window.webkitAudioContext)();
            var source = _micAudioContext.createMediaStreamSource(stream);
            _micAnalyser = _micAudioContext.createAnalyser();
            _micAnalyser.fftSize = 256;
            _micDataArray = new Uint8Array(_micAnalyser.fftSize);
            source.connect(_micAnalyser);
        })
        .catch(function(err) {
            console.warn('Mic access denied:', err);
            micEnabled = false;
        });
}

function stopMic() {
    if (_micStream) {
        _micStream.getTracks().forEach(function(t) { t.stop(); });
        _micStream = null;
    }
    if (_micAudioContext) {
        _micAudioContext.close();
        _micAudioContext = null;
    }
    _micAnalyser = null;
    _micDataArray = null;
    micAmplitude = 0;
}


var scene = new THREE.Scene();

var bufferCamera = new THREE.PerspectiveCamera(75, bufferWidth / bufferHeight, 0.1, 1000);
bufferCamera.position.z = shapeZoom;

var camera = new THREE.OrthographicCamera( window.innerWidth / - 2, window.innerWidth / 2, window.innerHeight / 2, window.innerHeight / - 2, 0.1, 1000 );
camera.position.z = 5;

var renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

var controls = new THREE.TrackballControls(bufferCamera, renderer.domElement);
controls.noZoom = true;
controls.dynamicDampingFactor = 0.1;
controls.rotateSpeed = 1;

var controls2 = new THREE.OrbitControls(camera, renderer.domElement);
controls2.enableZoom = true;
controls2.enableRotate = false;
controls2.zoomSpeed = 0.5;
controls2.minZoom = 0.09;
controls2.maxZoom = 3;
controls2.enablePan = false;


var bufferScene = new THREE.Scene();
var bufferTexture = new THREE.WebGLRenderTarget( bufferWidth, bufferHeight, { minFilter: THREE.LinearMipMapLinearFilter, magFilter: THREE.LinearFilter, antialias: true});


/// buffer scene objects

var numAxes = 12;

var allShapes = [];
var numShapes = 10;
// var numShapes = 5;
var complexity = 5;

function createShapes()
{
	for (var i=0; i<numShapes; i++)
	{
		var shape = new TorusKnotShape();
		shape.update();
		bufferScene.add(shape.mesh);
		allShapes[i] = shape;

		if (i < complexity) {
			shape.mesh.visible = true;
		} else {
			shape.mesh.visible = false;
		}
	}	
}
createShapes();


var ambientLight = new THREE.AmbientLight(0x808080);
bufferScene.add(ambientLight);

var pointLight = new THREE.PointLight(0xaaaaaa);
pointLight.position.set(0,50,200);
bufferScene.add(pointLight);

var pointLight = new THREE.PointLight(0x404040);
pointLight.position.set(0,50,-200);
bufferScene.add(pointLight);


/// main scene objects

var ambientLight = new THREE.AmbientLight(0x404040);
scene.add(ambientLight);

var pointLight3 = new THREE.PointLight(0xffffff);
pointLight3.position.set(-100,200,100);
scene.add(pointLight3);



// main object

var tileHolder;
var tileMat = new THREE.MeshBasicMaterial({map:bufferTexture, side:THREE.DoubleSide});


function updateGridGeometry()
{
	console.log("updating geometry");

	scene.remove(tileHolder);
	tileHolder = new THREE.Object3D();

	var theta = 0;
	var numSteps = numAxes;
	var step = 2*Math.PI / numSteps;
	var radius = 1;

	var tileGeometry = new THREE.Geometry();
	tileGeometry.vertices.push(new THREE.Vector3(0,0,0));

	var snapStep; // number of steps between simplified shape vertices
	var stepAngle;
	var rotOffset;

	// compute tile width
	var p1 = new THREE.Vector2(radius*Math.cos(0), radius*Math.sin(0));
	var p2 = new THREE.Vector2(radius*Math.cos(stepAngle), radius*Math.sin(stepAngle));
	var dist = p1.distanceTo(p2);
	var a = dist / 2;
	var c = radius;
	var b = Math.sqrt(c*c - a*a);
	var tileWidth;
	var tileHeight;
	var tileRowOffset;


	// find out if numAxes is factor of 4 or 6
	if ( !(numAxes % 6) )
	{
		// factor of 6
		snapStep = numAxes/6;
		stepAngle = (2*Math.PI) / 6;
		rotOffset = stepAngle / 2;

		tileWidth = b*2;
		tileHeight = c + a;
		tileRowOffset = b;
	}
	else
	{
		// factor of 4
		snapStep = numAxes/4;
		stepAngle = (2*Math.PI) / 4;
		rotOffset = 0;

		tileWidth = c * 2;
		tileHeight = c;
		tileRowOffset = c;
	}
	

	// add vertices
	for (var i=0; i<numSteps; i++)
	{
		var mod = i % snapStep;
		var ratio = mod / snapStep;
		var position = Math.floor(i/snapStep);
		var angle1 = stepAngle * position;
		var angle2 = stepAngle * (position+1);
		var x, y;

		if (mod == 0) 
		{
			// standard vertex position
			x = radius * Math.cos(theta);
			y = radius * Math.sin(theta);
		}
		else
		{
			// interpolate between angle1 and angle2
			var x1 = radius * Math.cos(angle1);
			var y1 = radius * Math.sin(angle1);

			var x2 = radius * Math.cos(angle2);
			var y2 = radius * Math.sin(angle2);

			x = x1 + ( (x2-x1) * ratio );
			y = y1 + ( (y2-y1) * ratio );
		}

		tileGeometry.vertices.push(new THREE.Vector3(x ,y ,0));
		theta += step; 
	}

	// add faces
	for (var i=0; i<numSteps; i++)
	{
		var v1 = i+1;
		var v2 = i+2;
		if (v2 > numSteps) v2 = 1;
		tileGeometry.faces.push( new THREE.Face3( 0, v1, v2 ) );
	}


	tileGeometry.computeBoundingSphere();
	tileGeometry.computeBoundingBox();


	// set UV mapping
	tileGeometry.faceVertexUvs[0] = [];

	var mapWidth = 1/snapStep;
	var diff = 1 - mapWidth;
	var mapLeft = diff/2;
	var mapRight = 1 - diff/2;

	for (i = 0; i < tileGeometry.faces.length ; i++) 
	{
		if (i%2)
		{
			tileGeometry.faceVertexUvs[0].push([
				new THREE.Vector2( 0.5,  0),
				new THREE.Vector2( mapLeft, 1),
				new THREE.Vector2(  mapRight, 1)
			]);
		}
		else
		{
			tileGeometry.faceVertexUvs[0].push([
				new THREE.Vector2( 0.5,  0),
				new THREE.Vector2( mapRight, 1),
				new THREE.Vector2(  mapLeft, 1)
			]);
		}	
	}

	tileGeometry.uvsNeedUpdate = true;


	var tileRow = new THREE.Object3D();
	tileHolder.add(tileRow);

	var scale = bufferSize/3;

	var tileMesh = new THREE.Mesh(tileGeometry, tileMat);
	tileMesh.scale.set( scale, scale, 1 );
	tileMesh.rotation.z = rotOffset;
	tileRow.add(tileMesh);

	var tileCountX = 15;
	for (var i=0; i<tileCountX; i++)
	{
		var tileMeshLeft = tileMesh.clone();
		tileMeshLeft.position.x -= (tileWidth * scale) * (i+1);
		tileRow.add(tileMeshLeft);

		var tileMeshRight = tileMesh.clone();
		tileMeshRight.position.x += (tileWidth * scale) * (i+1);
		tileRow.add(tileMeshRight);
	}

	var tileCountY = 10;
	for (var i=0; i<tileCountY; i++)
	{
		var tileRowTop = tileRow.clone();
		tileRowTop.position.y += tileHeight * scale * (i+1);
		if (!(i%2)) tileRowTop.position.x += tileRowOffset * scale;
		tileHolder.add(tileRowTop);

		var tileRowBottom = tileRow.clone();
		tileRowBottom.position.y -= tileHeight * scale * (i+1);
		if (!(i%2)) tileRowBottom.position.x += tileRowOffset * scale;
		tileHolder.add(tileRowBottom);
	}



	scene.add(tileHolder);
}

updateGridGeometry();


// test plane
var planeMat = new THREE.MeshBasicMaterial({map:bufferTexture, side:THREE.DoubleSide});
var planeGeo = new THREE.PlaneGeometry(bufferWidth/2, bufferHeight/2);
var planeObj = new THREE.Mesh(planeGeo, planeMat);
scene.add(planeObj);
planeObj.visible = false;


// GUI



var gui = new dat.GUI();
gui.add(this, "speed", 0, 2);
var complexityControl = gui.add(this, "complexity", 1, 10).step(1);
var shapeZoomControl = gui.add(this, "shapeZoom", 1, 3);
var saturationControl = gui.add(this, "saturation", 0, 3);
var lightnessControl = gui.add(this, "lightness", 0, 3);
var numAxesControl = gui.add(this, "numAxes", [4, 6, 8, 12, 16, 18, 20, 24, 28, 30, 32, 36]);
var textureControl = gui.add(this, "showTexture");
gui.add(this, "isPaused").listen();
gui.add(this, "randomize");
gui.add(this, "randomizeColor");

var autoZoomControl = gui.add(this, "autoZoom");
gui.add(this, "autoZoomSpeed", 0.0, 1);
gui.add(this, "autoZoomMin", 0.09, 3);
gui.add(this, "autoZoomMax", 0.09, 3);

autoZoomControl.onChange(function(value) {
    controls2.enableZoom = !value;
    zoomPhase = startZoomPhase;
});

var micControl = gui.add(this, "micEnabled");
gui.add(this, "micSensitivity", 1, 50);
gui.add(this, "micBeatThreshold", 1.1, 5);
gui.add(this, "micBeatCooldown", 0.1, 1.0);
gui.add(this, "micBeatDivisor", 1, 32).step(1);

micControl.onChange(function(value) {
    if (value) {
        startMic();
        controls2.enableZoom = false;
    } else {
        stopMic();
        controls2.enableZoom = !autoZoom;
    }
});


var autoRotateControl = gui.add(this, "autoRotate");
gui.add(this, "autoRotateWait", 0.5, 20);
gui.add(this, "autoRotateDuration", 0.1, 5);
gui.add(this, "autoRotateStep", 15, 180).step(15);

autoRotateControl.onChange(function(value) {
    if (!value) camera.rotation.z = 0;
    _rotatePhase = 'waiting';
    _rotateTimer = 0;
});

shapeZoomControl.onChange(function(value){
	bufferCamera.position.z = shapeZoom;
});

numAxesControl.onChange(function(value){
	updateGridGeometry();
});

textureControl.onChange(function(value){
	planeObj.visible = showTexture;
});

complexityControl.onChange(function(value)
{
	for (var i=0; i<numShapes; i++) 
	{
		if (i < complexity) {
			allShapes[i].mesh.visible = true;
		} else {
			allShapes[i].mesh.visible = false;
		}
	}
});

saturationControl.onChange(function(value)
{
	for (var i=0; i<numShapes; i++) {
		allShapes[i].updateColor();
	}
});

lightnessControl.onChange(function(value)
{
	for (var i=0; i<numShapes; i++) {
		allShapes[i].updateColor();
	}
});

function randomize()
{
	for (var i=0; i<numShapes; i++) {
		allShapes[i].update();
		bufferScene.remove(allShapes[i].mesh);
	}
	createShapes();
}

function randomizeColor()
{
	for (var i=0; i<numShapes; i++) {
		allShapes[i].randomizeColor();
	}
}


function render()
{
	stats.begin();

	update();
	
	renderer.render(bufferScene, bufferCamera, bufferTexture);
	renderer.render(scene, camera);

	stats.end();

	requestAnimationFrame(render);
}
render();

function update()
{
	controls.update();

	var now = Date.now();
	var dt = lastUpdateTime !== null ? (now - lastUpdateTime) / 1000 : 0;
	lastUpdateTime = now;

	if (!isPaused)
	{
		for (var i=0; i<complexity; i++) {
			allShapes[i].update();
		}

		if (micEnabled && _micAnalyser) {
			var raw = getMicAmplitude() * micSensitivity;
			// slow baseline tracks ambient level
			_micSlowAmp = _micSlowAmp * 0.97 + raw * 0.03;
			var nowSec = now / 1000;
			var timeSinceBeat = nowSec - _lastBeatTime;
			// detect a spike above threshold with cooldown
			if (raw > Math.max(_micSlowAmp * micBeatThreshold, 0.01) && timeSinceBeat > micBeatCooldown) {
				// only incorporate interval if it's in a plausible BPM range (30-240 BPM)
				if (timeSinceBeat < 2.0) {
					_beatInterval = _beatInterval * 0.8 + timeSinceBeat * 0.2;
				}
				_lastBeatTime = nowSec;
				autoZoomSpeed = 1.0 / (_beatInterval * micBeatDivisor);
				autoRotateWait = _beatInterval * micBeatDivisor;
			}
		}

		if (autoRotate) {
			if (_rotatePhase === 'waiting') {
				_rotateTimer += dt;
				if (_rotateTimer >= autoRotateWait) {
					_rotateTimer = 0;
					_rotatePhase = 'rotating';
					_rotateProgress = 0;
					_rotateFrom = camera.rotation.z;
					_rotateTo = _rotateFrom + autoRotateStep * Math.PI / 180;
				}
			} else {
				_rotateProgress += dt / autoRotateDuration;
				if (_rotateProgress >= 1) {
					_rotateProgress = 1;
					_rotatePhase = 'waiting';
					_rotateTimer = 0;
				}
				// ease in-out
				var t = _rotateProgress < 0.5
					? 2 * _rotateProgress * _rotateProgress
					: 1 - Math.pow(-2 * _rotateProgress + 2, 2) / 2;
				camera.rotation.z = _rotateFrom + (_rotateTo - _rotateFrom) * t;
			}
		}

		if (autoZoom || micEnabled) {
			zoomPhase += dt * autoZoomSpeed;
			var logMin = Math.log(autoZoomMin);
			var logMax = Math.log(autoZoomMax);
			var logMid = (logMax + logMin) / 2;
			var logAmp = (logMax - logMin) / 2;
			camera.zoom = Math.exp(logMid + logAmp * Math.sin(zoomPhase * Math.PI * 2));
			camera.updateProjectionMatrix();
		}
	}
}

window.addEventListener('resize', function() 
{
	var WIDTH = window.innerWidth;
	var HEIGHT = window.innerHeight;
	renderer.setSize(WIDTH, HEIGHT);

	camera.left = window.innerWidth / - 2;
	camera.right = window.innerWidth / 2;
	camera.top = window.innerHeight / 2;
	camera.bottom = window.innerHeight / - 2;
	camera.updateProjectionMatrix();
});

window.addEventListener('keydown', function(e){
	e = e || window.event;

    if (e.keyCode == '32')  {
    	isPaused = !isPaused;
    }
});



