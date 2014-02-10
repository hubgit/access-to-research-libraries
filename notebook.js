function notebookController($scope, $http) {
	$scope.url = 'http://www.accesstoresearch.org.uk/libraries';
	$scope.libraries = [];
	$scope.viewing = true;

	var geocoder = new google.maps.Geocoder();
	var map = new google.maps.Map(document.getElementById('map'));

	var postcode_regex = /([A-Z]{1,2}[0-9][0-9A-Z]?)\s+([0-9][A-Z]{2})/g;

	var proxy = function(url) {
		//return 'http://www.corsproxy.com/' + url.replace(/^http:\/\//, '');
		return 'proxy.php?url=' + encodeURIComponent(url.replace(/^http:\/\//, ''));
	};

	$http.get('libraries.json').success(function(data) {
		$scope.libraries = data;
		$scope.mapLocations();
	});

	$scope.setViewing = function(value) {
		$scope.viewing = value;
	}

	$scope.fetchLibraries = function($event) {
		var button = $event.target;
		var buttonText = button.textContent;
		button.textContent = 'Fetching libraries…';

		$scope.libraries = [];

		EAT.get(proxy($scope.url), 'document').then(function(result) {
			var template = ['ul.letters a', {
				url: '@href',
				name: '.'
			}];

			$scope.libraries = EAT.extract(template, result);
			$event.target.textContent = buttonText;
			$scope.$apply();
		});
	};

	$scope.saveData = function() {
		var json = JSON.stringify($scope.libraries, null, 2);
		var blob = new Blob([ json ], { type: 'application/json' });
        var url = window.URL.createObjectURL(blob);

		var a = document.createElement('a');
		a.href = url;
		a.download = 'libraries.json';
		a.click();

		window.URL.revokeObjectURL(url);
	};

	var geocode = function(library, key) {
		geocoder.geocode( { address: library.name + ', UK' }, function(results, status) {
		    if (status == google.maps.GeocoderStatus.OK) {
		    	results[0].address_components.forEach(function(component) {
		    		if (component.types.indexOf('postal_code') !== -1) {
		    			if (component.long_name.match(postcode_regex)) {
		    				$scope.libraries[key].postcodes = [component.long_name];
		    			}
		    		}
		    	});
		    }
		});
	};

	var matchPostcode = function(result, library, key) {
		var matches = result.body.textContent.match(postcode_regex);

		if (matches) {
			$scope.libraries[key].postcodes = matches;
		} else {
			var nodes = result.querySelectorAll('a');

			for (var i = 0; i < nodes.length; i++) {
				var node = nodes[i];

				if (node.textContent.match(/^Address\W/)) {
					var request = EAT.get(proxy(node.href), 'document');

					request.then(function(result) {
						matchPostcode(result, library, key);
					});

					return;
				}
			}

			geocode(library, key);
		}
	};

	$scope.fetchPostcodes = function($event) {
		var button = $event.target;
		var buttonText = button.textContent;
		button.textContent = 'Finding postcodes…';

		var requests = $scope.libraries.map(function(library, key) {
			if (library.postcodes) {
				return;
			}

			var request = EAT.get(proxy(library.url), 'document');

			request.then(function(result) {
				matchPostcode(result, library, key);
			});

			request.catch(function() {
				geocode(library, key);
			});

			return request;
		});

		Promise.all(requests).then(function() {
			button.textContent = buttonText;
			$scope.$apply();
		});
	};

	$scope.selectPostcode = function() {
		var postcodes = {};

		$scope.libraries.forEach(function(library) {
			if (library.postcodes) {
				var unique = library.postcodes.filter(function(postcode, index){
				    return library.postcodes.indexOf(postcode) == index;
				});

				unique.forEach(function(postcode) {
					if (!postcodes[postcode]) {
						postcodes[postcode] = 0;
					}

					postcodes[postcode]++;
				});
			}
		});

		$scope.libraries.forEach(function(library) {
			library.postcode = null;

			if (library.postcodes) {
				library.postcodes.forEach(function(postcode) {
					if (postcodes[postcode] === 1) {
						library.postcode = postcode;
						return false;
					}
				});
			}
		});
	};

	var fetchLocation = function(library) {
		var code = library.postcode.replace(/\W/, '');
		var url = 'http://data.ordnancesurvey.co.uk/doc/postcodeunit/' + code + '.json';
		var id = 'http://data.ordnancesurvey.co.uk/id/postcodeunit/' + code;

		return EAT.queue({ url: url, responseType: 'json' }).then(function(data) {
			library.latitude = data[id]['http://www.w3.org/2003/01/geo/wgs84_pos#lat'][0].value;
			library.longitude = data[id]['http://www.w3.org/2003/01/geo/wgs84_pos#long'][0].value;
			$scope.$apply();
		});
	};

	$scope.fetchLocations = function($event) {
		var button = $event.target;
		var buttonText = button.textContent;
		button.textContent = 'Finding locations…';

		var requests = $scope.libraries.map(function(library) {
			library.latitude = null;
			library.longitude = null;

			if (library.postcode) {
				return fetchLocation(library);
			}
		});

		Promise.all(requests).then(function() {
			button.textContent = buttonText;
		});
	};

	$scope.mapLocations = function() {
		var bounds = new google.maps.LatLngBounds();

		$scope.libraries.forEach(function(library) {
			if (library.latitude && library.longitude) {
				var marker = new google.maps.Marker({
				    map: map,
				    position: new google.maps.LatLng(library.latitude, library.longitude)
				});

				bounds.extend(marker.position);
			}
		});

		map.fitBounds(bounds);
	};
}