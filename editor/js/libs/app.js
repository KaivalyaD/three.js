import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FirstPersonControls } from 'three/addons/controls/FirstPersonControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GlitchPass } from 'three/addons/postprocessing/GlitchPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

var APP = {

	Player: function () {

		var renderer = new THREE.WebGLRenderer( { antialias: true } );
		renderer.setPixelRatio( window.devicePixelRatio ); // TODO: Use player.setPixelRatio()

		var composer = undefined;

		var loader = new THREE.ObjectLoader();
		var camera, scene;

		var events = {};

		var dom = document.createElement( 'div' );
		dom.appendChild( renderer.domElement );

		this.dom = dom;
		this.canvas = renderer.domElement;

		this.width = 500;
		this.height = 500;

		this.simpx_symbol_registry = new Map();

		this.load = function ( json ) {
			this.simpx_symbol_registry.clear();

			var project = json.project;

			if ( project.shadows !== undefined ) renderer.shadowMap.enabled = project.shadows;
			if ( project.shadowType !== undefined ) renderer.shadowMap.type = project.shadowType;
			if ( project.toneMapping !== undefined ) renderer.toneMapping = project.toneMapping;
			if ( project.toneMappingExposure !== undefined ) renderer.toneMappingExposure = project.toneMappingExposure;

			this.setScene( loader.parse( json.scene ) );
			this.setCamera( loader.parse( json.camera ) );

			events = {
				init: [],
				start: [],
				stop: [],
				keydown: [],
				keyup: [],
				pointerdown: [],
				pointerup: [],
				pointermove: [],
				update: [],
				simpx_register_exported_symbols: []
			};

			var scriptWrapParams = 'player,renderer,composer,scene,camera,simpx_import_symbols';
			var scriptWrapResultObj = {};

			for ( var eventKey in events ) {

				scriptWrapParams += ',' + eventKey;
				scriptWrapResultObj[ eventKey ] = eventKey;

			}

			var scriptWrapResult = JSON.stringify( scriptWrapResultObj ).replace( /\"/g, '' );

			for ( var uuid in json.scripts ) {

				var object = scene.getObjectByProperty( 'uuid', uuid, true );

				if ( object === undefined ) {

					console.warn( 'APP.Player: Script without object.', uuid );
					continue;

				}

				var scripts = json.scripts[ uuid ];

				for ( var i = 0; i < scripts.length; i ++ ) {

					var script = scripts[ i ];

					var functions = ( new Function( scriptWrapParams, script.source + '\nreturn ' + scriptWrapResult + ';' ).bind( object ) )( this, renderer, composer, scene, camera, this.simpx_import_symbols.bind( this ) );

					for ( var name in functions ) {

						if ( functions[ name ] === undefined ) continue;

						if ( events[ name ] === undefined ) {

							console.warn( 'APP.Player: Event type not supported (', name, ')' );
							continue;

						}

						if ( 'simpx_register_exported_symbols' === name ) {

							this.simpx_register_exported_symbols( object, script, functions[ name ]() )

						}

						events[ name ].push( functions[ name ].bind( object ) );

					}

				}

			}

			this.simpx_register_exported_symbols(
				scene,
				{ 
					name: 'Global',
					source: ''
				},
				{
					'OrbitControls': OrbitControls,
					'FirstPersonControls': FirstPersonControls,
					'EffectComposer': EffectComposer,
					'RenderPass': RenderPass,
					'GlitchPass': GlitchPass,
					'OutputPass': OutputPass,
					/* similarly, more can be added */
				}
			);

			dispatch( events.init, arguments );

		};

		this.setCamera = function ( value ) {

			camera = value;
			camera.aspect = this.width / this.height;
			camera.updateProjectionMatrix();

		};

		this.setScene = function ( value ) {

			scene = value;

		};

		this.setPixelRatio = function ( pixelRatio ) {

			renderer.setPixelRatio( pixelRatio );

		};

		this.setSize = function ( width, height ) {

			this.width = width;
			this.height = height;

			if ( camera ) {

				camera.aspect = this.width / this.height;
				camera.updateProjectionMatrix();

			}

			renderer.setSize( width, height );

		};

		function dispatch( array, event ) {

			for ( var i = 0, l = array.length; i < l; i ++ ) {

				array[ i ]( event );

			}

		}

		var time, startTime, prevTime;

		function animate() {

			time = performance.now();

			try {

				dispatch( events.update, { time: time - startTime, delta: time - prevTime } );

			} catch ( e ) {

				console.error( ( e.message || e ), ( e.stack || '' ) );

			}

			if( !composer )
				renderer.render( scene, camera );
			else
				composer.render();

			prevTime = time;

		}

		this.play = function () {

			startTime = prevTime = performance.now();

			document.addEventListener( 'keydown', onKeyDown );
			document.addEventListener( 'keyup', onKeyUp );
			document.addEventListener( 'pointerdown', onPointerDown );
			document.addEventListener( 'pointerup', onPointerUp );
			document.addEventListener( 'pointermove', onPointerMove );

			dispatch( events.start, arguments );

			renderer.setAnimationLoop( animate );

		};

		this.stop = function () {

			document.removeEventListener( 'keydown', onKeyDown );
			document.removeEventListener( 'keyup', onKeyUp );
			document.removeEventListener( 'pointerdown', onPointerDown );
			document.removeEventListener( 'pointerup', onPointerUp );
			document.removeEventListener( 'pointermove', onPointerMove );

			dispatch( events.stop, arguments );

			renderer.setAnimationLoop( null );

		};

		this.render = function ( time ) {

			dispatch( events.update, { time: time * 1000, delta: 0 /* TODO */ } );

			if( !composer )
				renderer.render( scene, camera );
			else
				composer.render();
		};

		this.dispose = function () {

			if( composer )
				composer.dispose();
			if( renderer )
				renderer.dispose();

			camera = undefined;
			scene = undefined;

		};

		this.simpx_register_exported_symbols = function( object, script, exported_symbols ) {

			/* TODO: for the same object, disallow same name for >1 scripts */
		
			if ( undefined === this.simpx_symbol_registry.get( object.name ) )
				this.simpx_symbol_registry.set( object.name, new Set() );

			const registry_entries = this.simpx_symbol_registry.get( object.name );
			const simpx_new_registry_entry = {
				object_uuid: object.uuid,
				script_name: script.name,
				exported_symbols: exported_symbols
			}

			registry_entries.add( simpx_new_registry_entry );
		};

		this.simpx_import_symbols = function( script_path, symbol ) {

			let components = script_path.split( '/' );
			let resolved_object_name = components[ components.length - 2 ];
			
			if( !this.simpx_symbol_registry.has( resolved_object_name ) )
				throw new Error(
					`App.Player: no exported symbol was found for object '${ resolved_object_name }'`
				);

			const script_entries = this.simpx_symbol_registry.get( resolved_object_name );
			const script_entry_iterator = script_entries.values();
			let script_entry;

			let script_was_found = false;
			let resolved_script_name = components[ components.length - 1 ];
			for ( let entry = script_entry_iterator.next().value; entry ; entry = script_entry_iterator.next().value ) {
				if ( resolved_script_name === entry.script_name ) {
					script_was_found = true;
					script_entry = entry;
					break;
				}
			}
			if ( !script_was_found )
				throw new Error(
					`App.Player: script '${ resolved_script_name }' does not exist for object ${ resolved_object_name }`
				);
			
			if( symbol && !script_entry.exported_symbols.hasOwnProperty( symbol ) )
				throw new Error(
					`App.Player: script '${ script_path }' does not export symbol ${ symbol }`
				);
			
			return symbol ? script_entry.exported_symbols[ symbol ] : script_entry.exported_symbols;
		};

		//

		function onKeyDown( event ) {

			dispatch( events.keydown, event );

		}

		function onKeyUp( event ) {

			dispatch( events.keyup, event );

		}

		function onPointerDown( event ) {

			dispatch( events.pointerdown, event );

		}

		function onPointerUp( event ) {

			dispatch( events.pointerup, event );

		}

		function onPointerMove( event ) {

			dispatch( events.pointermove, event );

		}

	}

};

export { APP };
