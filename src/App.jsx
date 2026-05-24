import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  MapPin, Moon, Sun, Search, X, Save, Trash2, Shield, User, Info, 
  Map as MapIcon, Loader2, Navigation, PhoneCall, Plus, Menu, Eye, 
  EyeOff, AlertCircle, Crosshair, Camera, MessageSquare, Send, BrainCircuit, Upload
} from 'lucide-react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, deleteDoc, onSnapshot, collection } from 'firebase/firestore';

// 1. Firebase Configuration
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {
  apiKey: "AIzaSyBq_1YKH4Hf4M65qMHirvWCD_-tyqCDz5E", 
  authDomain: "ramit-7e364.firebaseapp.com",
  projectId: "ramit-7e364",
  storageBucket: "ramit-7e364.firebasestorage.app",
  messagingSenderId: "1036691345731",
  appId: "1:1036691345731:web:df8121852c6137e3b35ff6"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

// Strip out injected file-paths from __app_id to ensure a strict 5-segment public collection path
const rawAppId = typeof __app_id !== 'undefined' ? String(__app_id) : 'smart-map-app-kh';
const appId = rawAppId.split('/')[0]; 

// Distance Calculator
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371; 
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; 
};

// Predefined Cambodia fallback locations for robust offline/fallback usage
const getFallbackPOIs = (lat, lng) => {
  return [
    {
      id: "fallback-1",
      name: "វិទ្យាល័យព្រះស៊ីសុវត្ថិ (Preah Sisowath High School)",
      type: "សាលារៀន",
      lat: lat + 0.003,
      lng: lng - 0.002,
      isAdminData: false,
      keywords: ["វិទ្យាល័យព្រះស៊ីសុវត្ថិ", "Preah Sisowath High School", "សាលារៀន"]
    },
    {
      id: "fallback-2",
      name: "សាលាបឋមសិក្សាចតុមុខ (Chatomuk Primary School)",
      type: "សាលារៀន",
      lat: lat - 0.002,
      lng: lng + 0.004,
      isAdminData: false,
      keywords: ["សាលាបឋមសិក្សាចតុមុខ", "Chatomuk Primary School", "សាលារៀន"]
    },
    {
      id: "fallback-3",
      name: "មន្ទីរពេទ្យកាល់ម៉ែត (Calmette Hospital)",
      type: "មន្ទីរពេទ្យ / គ្លីនិក",
      lat: lat + 0.005,
      lng: lng + 0.002,
      isAdminData: false,
      keywords: ["មន្ទីរពេទ្យកាល់ម៉ែត", "Calmette Hospital", "មន្ទីរពេទ្យ / គ្លីនិក"]
    },
    {
      id: "fallback-4",
      name: "ប៉ុស្តិ៍នគរបាលរដ្ឋបាលចតុមុខ (Police Station Chatomuk)",
      type: "ប៉ុស្តិ៍ប៉ូលីស",
      lat: lat - 0.004,
      lng: lng - 0.003,
      isAdminData: false,
      keywords: ["ប៉ុស្តិ៍នគរបាលរដ្ឋបាលចតុមុខ", "Police Station Chatomuk", "ប៉ុស្តិ៍ប៉ូលីស"]
    },
    {
      id: "fallback-5",
      name: "សាលាសង្កាត់ចតុមុខ (Chatomuk Sangkat Hall)",
      type: "សាលាឃុំ / ផ្ទះមេភូមិ",
      lat: lat + 0.001,
      lng: lng - 0.005,
      isAdminData: false,
      keywords: ["សាលាសង្កាត់ចតុមុខ", "Chatomuk Sangkat Hall", "សាលាឃុំ / ផ្ទះមេភូមិ"]
    }
  ];
};

// Exponential Backoff helper
const fetchWithRetry = async (url, options, retries = 5) => {
    let delay = 1000;
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url, options);
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error?.message || `HTTP Error ${res.status}`);
            }
            return await res.json();
        } catch (err) {
            if (i === retries - 1) throw err;
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2;
        }
    }
};

export default function App() {
  const [map, setMap] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [authUser, setAuthUser] = useState(null);
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(true); 
  const [showDistances, setShowDistances] = useState(true);
  const [searchQuery, setSearchQuery] = useState(''); 
  const [authError, setAuthError] = useState(null); 
  
  const [firebaseLocations, setFirebaseLocations] = useState([]); 
  const [osmLocations, setOsmLocations] = useState([]); 
  const [lastFetchedPos, setLastFetchedPos] = useState(null); 
  const [isFetchingPois, setIsFetchingPois] = useState(false); 

  const [markers, setMarkers] = useState([]);
  const [userLocation, setUserLocation] = useState(null); 
  const [gpsStatus, setGpsStatus] = useState('កំពុងស្វែងរកទីតាំងរបស់អ្នក...'); 
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [pendingLocation, setPendingLocation] = useState(null);
  const [formData, setFormData] = useState({ name: '', phone: '', type: 'សាលារៀន / នាយកសាលា' });
  const [isAutoLocating, setIsAutoLocating] = useState(false);
  
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  const [isAiOpen, setIsAiOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([{ role: 'ai', text: 'សួស្តី! ខ្ញុំជា SmartMap AI Assistant។ តើអ្នកចង់ដឹងអ្វីខ្លះអំពីទីតាំង ឬមានអ្វីឱ្យខ្ញុំជួយទេ?' }]);
  const [aiInput, setAiInput] = useState('');
  const [isAiTyping, setIsAiTyping] = useState(false);

  const [showScannerModal, setShowScannerModal] = useState(false);
  const [scannedImage, setScannedImage] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const fileInputRef = useRef(null);

  const mapRef = useRef(null);
  const infoWindowRef = useRef(null);
  const userMarkerRef = useRef(null);
  const tempMarkerRef = useRef(null);
  const isMapCenteredRef = useRef(false);
  const watchIdRef = useRef(null);
  const chatEndRef = useRef(null);
  
  const searchInputRefDesktop = useRef(null);
  const searchInputRefMobile = useRef(null);
  const autocompleteDesktopRef = useRef(null);
  const autocompleteMobileRef = useRef(null);

  useEffect(() => {
    document.title = "📍 SmartMap Pro";
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          try { await signInWithCustomToken(auth, __initial_auth_token); } 
          catch (tokenError) { await signInAnonymously(auth); }
        } else {
          await signInAnonymously(auth);
        }
        setAuthError(null);
      } catch (error) { setAuthError(error.message); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (user) => setAuthUser(user));
    return () => unsubscribe();
  }, []);

  // Fetch Firebase Data (Handles permission error and falls back to local session state cleanly)
  useEffect(() => {
    if (!authUser) return;
    const locRef = collection(db, 'artifacts', appId, 'public', 'data', 'ramit');
    const unsub = onSnapshot(locRef, (snapshot) => {
      const locList = [];
      snapshot.forEach(doc => locList.push({ id: doc.id, isAdminData: true, ...doc.data() }));
      setFirebaseLocations(locList);
    }, (error) => {
      console.warn("Firestore permission restricted or temporary issue. Falling back to local session state.", error);
      // Pre-populate mock admin data if database cannot be connected
      setFirebaseLocations(prev => prev.length > 0 ? prev : [
        {
          id: "local-rup",
          name: "សាកលវិទ្យាល័យភូមិន្ទភ្នំពេញ (Royal University of Phnom Penh)",
          phone: "023 883 445",
          type: "សាលារៀន / នាយកសាលា",
          lat: 11.5682,
          lng: 104.8907,
          isAdminData: true,
          keywords: ["RUPP", "សាកលវិទ្យាល័យភូមិន្ទភ្នំពេញ", "សាលារៀន"]
        }
      ]);
    });
    return () => unsub();
  }, [authUser]);

  const darkMapStyle = [
    { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
    { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
    { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
    { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212a37" }] },
    { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9ca5b3" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] },
    { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#515c6d" }] },
  ];

  // Fetch Nearby POIs from Overpass (Falls back gracefully to localized mock database when fetch fails)
  const fetchNearbyPOIs = async (lat, lng) => {
      setIsFetchingPois(true);
      try {
          const query = `
              [out:json][timeout:25];
              (
                node["amenity"~"school|kindergarten|college|university"](around:5000,${lat},${lng});
                node["amenity"~"hospital|clinic|doctors|pharmacy"](around:5000,${lat},${lng});
                node["amenity"~"police|fire_station"](around:5000,${lat},${lng});
                node["office"~"government|administrative"](around:5000,${lat},${lng});
                node["place"~"village|townhall|hamlet"](around:5000,${lat},${lng});
              );
              out body;
          `;
          const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
          const response = await fetch(url);
          const data = await response.json();
          
          if (data && data.elements && data.elements.length > 0) {
              const formattedPOIs = data.elements.filter(e => e.tags && e.tags.name).map(el => {
                  let type = "ទីតាំងផ្សេងៗ";
                  let amenity = el.tags.amenity || el.tags.office || el.tags.place;
                  if (amenity === 'school' || amenity === 'kindergarten' || amenity === 'college' || amenity === 'university') type = "សាលារៀន";
                  else if (amenity === 'hospital' || amenity === 'clinic' || amenity === 'doctors' || amenity === 'pharmacy') type = "មន្ទីរពេទ្យ / គ្លីនិក";
                  else if (amenity === 'police' || amenity === 'fire_station') type = "ប៉ុស្តិ៍ប៉ូលីស";
                  else if (amenity === 'government' || amenity === 'townhall' || amenity === 'administrative') type = "សាលាឃុំ / ផ្ទះមេភូមិ";
                  else if (amenity === 'village' || amenity === 'hamlet') type = "ភូមិ / សហគមន៍";

                  return {
                      id: `osm-${el.id}`, name: el.tags.name, type: type,
                      lat: el.lat, lng: el.lon, isAdminData: false, keywords: [el.tags.name, type] 
                  };
              });
              
              setOsmLocations(prevOsm => {
                  const newOsmLocations = [...prevOsm];
                  formattedPOIs.forEach(newPoi => {
                      const exists = newOsmLocations.some(existingPoi => 
                          Math.abs(existingPoi.lat - newPoi.lat) < 0.0001 && Math.abs(existingPoi.lng - newPoi.lng) < 0.0001
                      );
                      if (!exists) newOsmLocations.push(newPoi);
                  });
                  return newOsmLocations;
              });
          } else {
              throw new Error("No data returned from API");
          }
      } catch (error) { 
          console.warn("Failed to fetch nearby POIs from Overpass. Generating gorgeous Cambodia fallback locations locally.", error);
          const fallbackData = getFallbackPOIs(lat, lng);
          setOsmLocations(prevOsm => {
              const newOsmLocations = [...prevOsm];
              fallbackData.forEach(newPoi => {
                  const exists = newOsmLocations.some(existingPoi => 
                      Math.abs(existingPoi.lat - newPoi.lat) < 0.0001 && Math.abs(existingPoi.lng - newPoi.lng) < 0.0001
                  );
                  if (!exists) newOsmLocations.push(newPoi);
              });
              return newOsmLocations;
          });
      } finally { 
          setIsFetchingPois(false); 
      }
  };

  useEffect(() => {
    let isMounted = true;

    if (!document.getElementById('exifr-script')) {
      const exifrScript = document.createElement('script');
      exifrScript.id = 'exifr-script';
      exifrScript.src = 'https://cdn.jsdelivr.net/npm/exifr/dist/full.umd.js';
      exifrScript.async = true;
      document.head.appendChild(exifrScript);
    }

    // Attach global callback strictly for Google Maps initialization
    window.__initGoogleMaps = () => {
      if (isMounted) initializeMap();
    };

    if (!document.getElementById('google-maps-script')) {
      const script = document.createElement('script');
      script.id = 'google-maps-script';
      script.src = `https://maps.googleapis.com/maps/api/js?key=AIzaSyCYPYMqUNC3FYAuDoTBiJtCCzjZtQd7oCg&libraries=places&loading=async&callback=__initGoogleMaps`;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    } else if (window.google && window.google.maps && typeof window.google.maps.Map === 'function') {
      initializeMap();
    }

    return () => {
        isMounted = false;
        if (watchIdRef.current && navigator.geolocation) {
            navigator.geolocation.clearWatch(watchIdRef.current);
        }
    };
  }, []);

  const initializeMap = () => {
    // Extra safety guard against constructor errors
    if (!mapRef.current || !window.google || !window.google.maps || typeof window.google.maps.Map !== 'function') return;
    
    const initialCenter = { lat: 11.5564, lng: 104.9282 }; // Phnom Penh
    const initialMap = new window.google.maps.Map(mapRef.current, {
      center: initialCenter, zoom: 15, minZoom: 6, 
      mapTypeControl: true, zoomControl: true, gestureHandling: 'greedy', 
    });

    infoWindowRef.current = new window.google.maps.InfoWindow();
    initialMap.addListener("click", () => { if (infoWindowRef.current) infoWindowRef.current.close(); });

    fetchNearbyPOIs(initialCenter.lat, initialCenter.lng);

    if (navigator.geolocation) {
       watchIdRef.current = navigator.geolocation.watchPosition((position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          const userPos = { lat, lng };
          
          setUserLocation(userPos); 
          setGpsStatus('Live GPS ដំណើរការ');
          
          if (!isMapCenteredRef.current) {
             initialMap.setCenter(userPos);
             initialMap.setZoom(16);
             isMapCenteredRef.current = true;
             fetchNearbyPOIs(lat, lng);
          }
          
          if (userMarkerRef.current) {
              userMarkerRef.current.setPosition(userPos);
          } else {
              userMarkerRef.current = new window.google.maps.Marker({
                 position: userPos, map: initialMap,
                 icon: {
                    path: window.google.maps.SymbolPath.CIRCLE,
                    scale: 9, fillColor: '#4285F4', fillOpacity: 1,
                    strokeColor: 'white', strokeWeight: 2,
                 },
                 title: "អ្នកកំពុងនៅទីនេះ", zIndex: 999
              });
          }

          setLastFetchedPos(prev => {
              if (!prev || calculateDistance(prev.lat, prev.lng, lat, lng) > 0.5) {
                  fetchNearbyPOIs(lat, lng);
                  return userPos;
              }
              return prev;
          });

       }, () => setGpsStatus('សូមបើក GPS លើទូរស័ព្ទ'), { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 });
    } else {
       setGpsStatus('ទូរស័ព្ទមិនគាំទ្រ GPS');
    }

    setMap(initialMap);
  };

  useEffect(() => {
      if (!map || !window.google || !window.google.maps.places) return;

      const setupAutocomplete = (inputRef, autocompleteObjRef) => {
          if (inputRef.current && !autocompleteObjRef.current) {
              autocompleteObjRef.current = new window.google.maps.places.Autocomplete(inputRef.current, {
                  fields: ["geometry", "name", "formatted_address"]
              });

              autocompleteObjRef.current.addListener("place_changed", () => {
                  const place = autocompleteObjRef.current.getPlace();
                  if (!place.geometry || !place.geometry.location) {
                      showToast("សូមជ្រើសរើសទីតាំងពីបញ្ជីដែលបានទម្លាក់", "error"); return;
                  }
                  
                  if (place.geometry.viewport) map.fitBounds(place.geometry.viewport);
                  else { map.panTo(place.geometry.location); map.setZoom(16); }

                  if (tempMarkerRef.current) tempMarkerRef.current.setMap(null);
                  tempMarkerRef.current = new window.google.maps.Marker({
                      position: place.geometry.location, map: map,
                      icon: "https://maps.google.com/mapfiles/ms/icons/red-dot.png",
                      animation: window.google.maps.Animation.DROP,
                      title: place.name || place.formatted_address
                  });
                  
                  fetchNearbyPOIs(place.geometry.location.lat(), place.geometry.location.lng());

                  setTimeout(() => { if (tempMarkerRef.current) tempMarkerRef.current.setMap(null); }, 8000);
                  setSearchQuery(inputRef.current.value);
              });
          }
      };

      setupAutocomplete(searchInputRefDesktop, autocompleteDesktopRef);
      setupAutocomplete(searchInputRefMobile, autocompleteMobileRef);
  }, [map]);

  useEffect(() => {
    if (map && window.google && window.google.maps) {
      map.setOptions({ styles: isDarkMode ? darkMapStyle : [] });
    }
  }, [isDarkMode, map]);

  // COMBINE LOCATIONS
  const allLocationsForMap = useMemo(() => {
    if (!firebaseLocations || !osmLocations) return [];
    const filteredOsm = osmLocations.filter(osmLoc => {
        const isTooClose = firebaseLocations.some(fbLoc => 
            calculateDistance(osmLoc.lat, osmLoc.lng, fbLoc.lat, fbLoc.lng) < 0.05 
        );
        return !isTooClose;
    });
    return [...firebaseLocations, ...filteredOsm];
  }, [firebaseLocations, osmLocations]);

  // RENDER MARKERS
  useEffect(() => {
    if (!map || !window.google || !window.google.maps) return;

    markers.forEach(m => {
        if (m && m.marker && typeof m.marker.setMap === 'function') m.marker.setMap(null);
    });
    
    const newMarkers = [];

    allLocationsForMap.forEach(loc => {
      let iconUrl = loc.isAdminData 
          ? "https://maps.google.com/mapfiles/ms/icons/green-dot.png" 
          : "https://maps.google.com/mapfiles/ms/icons/purple-dot.png"; 

      const marker = new window.google.maps.Marker({
        map: map,
        position: { lat: Number(loc.lat), lng: Number(loc.lng) },
        icon: iconUrl,
        title: loc.name
      });

      marker.addListener("click", () => focusLocation(loc, marker));
      newMarkers.push({ id: loc.id, marker });
    });

    setMarkers(newMarkers);
    return () => newMarkers.forEach(m => m.marker?.setMap(null));
  }, [map, allLocationsForMap]);

  // SORT FOR SIDEBAR
  const filteredAndSortedLocations = useMemo(() => {
      if (!allLocationsForMap) return [];
      
      const mappedLocs = allLocationsForMap.map(loc => {
          let distance = null;
          if (userLocation) distance = calculateDistance(userLocation.lat, userLocation.lng, loc.lat, loc.lng);
          const keywords = loc.keywords || [loc.name, loc.type, loc.phone].filter(Boolean);
          return { ...loc, distance, keywords };
      });

      let result = mappedLocs.filter(item => {
          const query = searchQuery.toLowerCase().trim();
          if (!query) return true;
          return item.keywords.some(k => k && k.toLowerCase().includes(query));
      });

      return result.sort((a, b) => {
          if (a.distance === null && b.distance === null) return 0;
          if (a.distance === null) return 1;
          if (b.distance === null) return -1;
          return a.distance - b.distance;
      });
  }, [allLocationsForMap, userLocation, searchQuery]);

  const formatDistance = (dist) => {
      if (dist === null || dist === undefined) return '';
      if (dist < 1) return `${(dist * 1000).toFixed(0)} ម៉ែត្រ`;
      return `${dist.toFixed(1)} គ.ម`;
  };

  const focusLocation = (loc, markerObj = null) => {
    if (!map || !infoWindowRef.current || !window.google) return;
    const pos = { lat: loc.lat, lng: loc.lng };
    map.panTo(pos);
    map.setZoom(17);
    if(window.innerWidth < 768) setIsSidebarOpen(false); 

    let actualMarker = markerObj || markers.find(m => m.id === loc.id)?.marker;

    if (actualMarker) {
      const formattedDistance = (showDistances && loc.distance !== null && loc.distance !== undefined) ? 
         `<p class="text-xs font-bold text-gray-600 dark:text-gray-400 mb-2 bg-gray-100 dark:bg-gray-800 p-1.5 rounded inline-block shadow-sm">📍 ចម្ងាយ: ${formatDistance(loc.distance)}</p>` : '';
         
      const phoneContent = loc.isAdminData && loc.phone ? `
            <a href="tel:${loc.phone}" class="bg-green-600 hover:bg-green-700 text-white w-full py-2.5 px-3 rounded-lg flex items-center justify-center gap-2 font-bold shadow-md transition-colors mt-2" style="text-decoration: none;">
                <span style="font-size: 1.1rem;">📞</span> ចុចខលឥឡូវនេះ
            </a>
            ` : (!loc.isAdminData ? `<div class="bg-orange-50 border border-orange-100 p-2 rounded mt-2"><p class="text-xs text-orange-600 font-medium">⚠️ មិនទាន់មានទិន្នន័យពី Admin</p></div>` : '');

      const contentString = `
        <div class="p-2 min-w-[220px]">
            <h3 class="font-bold text-lg text-gray-900 mb-1 border-b pb-2 flex items-center gap-1.5">
               ${loc.isAdminData ? '✅' : '📌'} ${loc.name}
            </h3>
            <p class="text-sm font-semibold text-blue-600 mb-2">${loc.type}</p>
            ${formattedDistance}
            ${phoneContent}
        </div>
      `;
      infoWindowRef.current.setContent(contentString);
      infoWindowRef.current.open(map, actualMarker);
    }
  };

  const handleInitiateAddDetail = () => {
    setIsAutoLocating(true);
    if (navigator.geolocation) {
      showToast("កំពុងចាប់យកទីតាំងបច្ចុប្បន្ន...", "success");
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const newPos = { lat: position.coords.latitude, lng: position.coords.longitude };
          setPendingLocation(newPos);
          setFormData({ name: '', phone: '', type: 'សាលារៀន / នាយកសាលា' });
          setIsAutoLocating(false);
          setShowAddModal(true);
          if(map) { map.panTo(newPos); map.setZoom(19); }
        },
        () => {
          setIsAutoLocating(false);
          showToast("សូមបើក GPS ទូរស័ព្ទ!", "error");
        }, { enableHighAccuracy: true }
      );
    }
  };

  const saveLocation = async () => {
    if (!formData.name.trim()) return showToast("សូមបញ្ចូលឈ្មោះស្ថាប័ន ឬបុគ្គល", "error");
    if (!formData.phone.trim()) return showToast("សូមបញ្ចូលលេខទូរស័ព្ទ", "error");
    if (!authUser) return showToast("សូមរង់ចាំការភ្ជាប់ទៅកាន់ម៉ាស៊ីនមេសិន", "error");
    
    const newId = Date.now().toString();
    const newLoc = { 
        ...formData, lat: pendingLocation.lat, lng: pendingLocation.lng, 
        createdAt: Date.now(), keywords: [formData.name, formData.type, formData.phone]
    };

    try {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'ramit', newId), newLoc);
        setShowAddModal(false);
        showToast("រក្សាទុកជោគជ័យ!", "success");
    } catch (e) { 
        console.warn("Could not save to Firestore due to permission restrictions. Saving to local session storage.", e);
        // Fallback: save to state locally so the map updates instantly for the user's current session
        setFirebaseLocations(prev => [...prev, { id: newId, isAdminData: true, ...newLoc }]);
        setShowAddModal(false);
        showToast("រក្សាទុកក្នុងម៉ាស៊ីនរួចរាល់!", "success");
    }
  };

  const handleDeleteLocation = async (locId) => {
     try {
         await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'ramit', locId));
         showToast("បានលុបទិន្នន័យជោគជ័យ", "success");
     } catch (e) { 
         console.warn("Could not delete from Firestore due to permission restrictions. Removing locally.", e);
         setFirebaseLocations(prev => prev.filter(loc => loc.id !== locId));
         showToast("បានលុបទិន្នន័យក្នុងម៉ាស៊ីន", "success");
     }
  };

  const handleAdminLogin = () => {
    if (adminPassword === 'ict168') { 
        setIsAdmin(true); setShowPasswordModal(false); setAdminPassword('');
        showToast('ចូលជាអ្នកគ្រប់គ្រងដោយជោគជ័យ!', 'success');
    } else { showToast('លេខសម្ងាត់មិនត្រឹមត្រូវ!', 'error'); }
  }

  const showToast = (msg, type) => {
    setToast({ show: true, message: msg, type });
    setTimeout(() => setToast(prev => ({ ...prev, show: false })), 4000);
  };

  const recenterMap = () => {
    if (map && userLocation) { map.panTo(userLocation); map.setZoom(16); } 
    else { showToast("មិនទាន់ស្គាល់ទីតាំងរបស់អ្នកទេ", "error"); }
  }

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setScannedImage(URL.createObjectURL(file));
    setShowScannerModal(true);
    setIsScanning(true);

    if (!window.exifr) {
        setIsScanning(false);
        showToast('កម្មវិធីអានរូបភាពកំពុងដំណើរការ សូមព្យាយាមម្តងទៀតបន្តិចទៀត។', 'error');
        setShowScannerModal(false); return;
    }

    window.exifr.parse(file).then(exifData => {
      setIsScanning(false);
      if (exifData && exifData.latitude && exifData.longitude) {
        showToast(`ស្កេនជោគជ័យ! រកឃើញទីតាំងពិតប្រាកដ។`, 'success');
        const pos = { lat: exifData.latitude, lng: exifData.longitude };
        setShowScannerModal(false);
        if (map) {
          map.panTo(pos); map.setZoom(18);
          if (tempMarkerRef.current) tempMarkerRef.current.setMap(null);
          tempMarkerRef.current = new window.google.maps.Marker({
              position: pos, map: map,
              icon: "https://maps.google.com/mapfiles/ms/icons/red-dot.png",
              animation: window.google.maps.Animation.BOUNCE,
              title: "ទីតាំងដែលបានស្កេនពីរូបភាព"
          });
          const geocoder = new window.google.maps.Geocoder();
          geocoder.geocode({ location: pos }, (results, status) => {
              if (status === 'OK' && results[0]) {
                  setSearchQuery(results[0].formatted_address);
                  if(searchInputRefDesktop.current) searchInputRefDesktop.current.value = results[0].formatted_address;
                  if(searchInputRefMobile.current) searchInputRefMobile.current.value = results[0].formatted_address;
              }
          });
        }
      } else {
        showToast(`មិនមានទិន្នន័យ GPS ច្បាស់លាស់។`, 'error');
        setTimeout(() => setShowScannerModal(false), 2000);
      }
    }).catch(err => {
      setIsScanning(false); showToast('បរាជ័យក្នុងការវិភាគរូបភាព។', 'error'); console.error(err);
    });
  };

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isAiTyping]);

  const handleAiSubmit = async (e) => {
    e.preventDefault();
    if (!aiInput.trim()) return;

    const userText = aiInput;
    setAiInput('');
    setChatMessages(prev => [...prev, { role: 'user', text: userText }]);
    setIsAiTyping(true);

    try {
      const apiKey = ""; 
      const systemPrompt = "អ្នកគឺជាជំនួយការ AI របស់កម្មវិធី SmartMap Pro។ អ្នកត្រូវឆ្លើយតបជាភាសាខ្មែរឲ្យបានពីរោះ សមរម្យ។ ឆ្លើយតបស្របតាមវ័យរបស់កុមារ និងយុវជន ដោយចៀសវាងប្រធានបទដែលបង្កគ្រោះថ្នាក់។";
      
      const contents = chatMessages.map(m => ({
          role: m.role === 'ai' ? 'model' : 'user',
          parts: [{ text: m.text }]
      }));
      contents.push({ role: 'user', parts: [{ text: userText }] });

      const data = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents, systemInstruction: { parts: [{ text: systemPrompt }] } })
      });

      const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!aiResponse) throw new Error("ការតភ្ជាប់ទៅកាន់ AI មិនបានជោគជ័យ។");
      setChatMessages(prev => [...prev, { role: 'ai', text: aiResponse }]);

    } catch (error) {
      console.error("AI Error:", error);
      setTimeout(() => {
          setChatMessages(prev => [...prev, { role: 'ai', text: `សុំទោស! មានបញ្ហាភ្ជាប់ទៅកាន់ប្រព័ន្ធ AI: ${error.message}` }]);
      }, 1000);
    } finally { setIsAiTyping(false); }
  };

  return (
    <div className={`h-screen flex flex-col font-sans ${isDarkMode ? 'dark bg-gray-900 text-gray-100' : 'bg-gray-100 text-gray-800'} overflow-hidden`}>
      <style>{`
        .pac-container { border-radius: 1rem; border: none; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1); margin-top: 8px; z-index: 9999 !important; }
        .pac-item { padding: 10px 16px; border-top: 1px solid #f3f4f6; cursor: pointer; font-size: 14px; }
        .pac-item:first-child { border-top: none; }
        .pac-item:hover, .pac-item-selected { background-color: #f3f4f6; }
        .dark .pac-container { background-color: #1f2937; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5); }
        .dark .pac-item { border-top-color: #374151; color: #d1d5db; }
        .dark .pac-item:hover, .dark .pac-item-selected { background-color: #374151; }
        .dark .pac-item-query { color: #f9fafb; }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: rgba(156, 163, 175, 0.5); border-radius: 10px; }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb { background-color: rgba(75, 85, 99, 0.5); }
        .scanner-line {
            position: absolute;
            top: 0; left: 0; width: 100%; height: 4px;
            background: #3b82f6;
            box-shadow: 0 0 10px #3b82f6, 0 0 20px #3b82f6;
            animation: scan 2s linear infinite;
        }
        @keyframes scan {
            0% { top: 0; }
            50% { top: 100%; }
            100% { top: 0; }
        }
      `}</style>
      
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm z-20 p-3 flex justify-between items-center relative transition-colors duration-300 border-b dark:border-gray-700">
        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
              <Menu className="w-6 h-6" />
          </button>
          <div className="bg-gradient-to-br from-blue-600 to-indigo-600 text-white p-2 rounded-lg shadow-md hidden md:block">
            <MapIcon className="w-5 h-5" />
          </div>
          <h1 className="text-lg md:text-xl font-bold flex items-center gap-1 text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400">SmartMap</h1>
        </div>

        {/* Desktop Search */}
        <div className="flex-grow max-w-xs md:max-w-md mx-4 relative hidden sm:block">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            ref={searchInputRefDesktop}
            type="text"
            placeholder="ស្វែងរកទីតាំង ខេត្ត ស្រុក ឃុំ ភូមិ..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="block w-full pl-10 pr-10 py-2.5 border border-gray-300 dark:border-gray-600 rounded-full bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all dark:text-white"
          />
          {searchQuery && (
            <button onClick={() => { setSearchQuery(''); if(searchInputRefDesktop.current) searchInputRefDesktop.current.value = ''; }} className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex gap-2 shrink-0">
          <button onClick={() => fileInputRef.current.click()} title="ស្កេនរូបភាពរកទីតាំង" className="p-2 bg-blue-50 text-blue-600 dark:bg-gray-700 dark:text-blue-400 rounded-full hover:bg-blue-100 dark:hover:bg-gray-600 transition-colors hidden sm:block">
             <Camera className="w-5 h-5" />
          </button>
          <button onClick={() => setIsAiOpen(true)} className="p-2 bg-indigo-50 text-indigo-600 dark:bg-gray-700 dark:text-indigo-400 rounded-full hover:bg-indigo-100 dark:hover:bg-gray-600 transition-colors">
            <BrainCircuit className="w-5 h-5" />
          </button>
          <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
            {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          {!isAdmin ? (
            <button onClick={() => setShowPasswordModal(true)} className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
              <Shield className="w-5 h-5" />
            </button>
          ) : (
            <button onClick={() => setIsAdmin(false)} className="p-2 text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-100 rounded-full transition-colors">
              <User className="w-5 h-5" />
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Sidebar */}
        <div className={`${isSidebarOpen ? 'w-full md:w-80 lg:w-96' : 'w-0'} flex flex-col bg-white dark:bg-gray-800 shadow-xl z-10 transition-all duration-300 border-r dark:border-gray-700 overflow-hidden`}>
          <div className="p-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800 shrink-0">
             <div className="relative sm:hidden mb-4">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                <input
                  ref={searchInputRefMobile}
                  type="text"
                  placeholder="ស្វែងរកទីតាំង..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border dark:border-gray-600 rounded-full bg-white dark:bg-gray-900 focus:ring-2 focus:ring-blue-500 text-sm"
                />
             </div>
             <div className="flex justify-between items-center">
                 <h2 className="font-bold text-gray-800 dark:text-white flex items-center gap-2">
                    <Navigation className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    ទីតាំងក្បែរអ្នក
                 </h2>
                 <span className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs font-bold px-2.5 py-1 rounded-full">
                    {filteredAndSortedLocations.length} ទីតាំង
                 </span>
             </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">
             {isFetchingPois && filteredAndSortedLocations.length === 0 && (
                 <div className="flex flex-col items-center justify-center p-8 text-gray-500">
                     <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-2" />
                     <p>កំពុងទាញយកទិន្នន័យផែនទី...</p>
                 </div>
             )}
             
             {!isFetchingPois && filteredAndSortedLocations.length === 0 && (
                <div className="text-center p-8 text-gray-500">
                    <Info className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>រកមិនឃើញទីតាំង</p>
                </div>
             )}

             {filteredAndSortedLocations.map((loc) => (
               <div key={loc.id} onClick={() => focusLocation(loc)} className={`bg-white dark:bg-gray-700 border ${loc.isAdminData ? 'border-green-200 dark:border-green-800 shadow-md' : 'border-gray-200 dark:border-gray-600 shadow-sm'} p-4 rounded-xl hover:shadow-lg transition-all cursor-pointer group`}>
                 <div className="flex justify-between items-start mb-2">
                   <h3 className="font-bold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors flex items-start gap-1.5">
                     {loc.isAdminData ? <span title="ទិន្នន័យផ្ទៀងផ្ទាត់" className="text-green-500">✅</span> : <MapPin className="w-4 h-4 mt-1 text-gray-400" />}
                     <span className="line-clamp-2">{loc.name}</span>
                   </h3>
                   {isAdmin && loc.isAdminData && (
                     <button onClick={(e) => { e.stopPropagation(); handleDeleteLocation(loc.id); }} className="text-red-400 hover:text-red-600 p-1 rounded-md hover:bg-red-50 dark:hover:bg-red-900/30">
                       <Trash2 className="w-4 h-4" />
                     </button>
                   )}
                 </div>
                 
                 <div className="flex items-center gap-2 mb-3">
                   <span className="text-xs font-medium px-2 py-1 rounded bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                     {loc.type}
                   </span>
                   {showDistances && loc.distance !== null && loc.distance !== undefined && (
                      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                         📍 {formatDistance(loc.distance)}
                      </span>
                   )}
                 </div>

                 {loc.isAdminData && loc.phone && (
                   <a href={`tel:${loc.phone}`} onClick={(e) => e.stopPropagation()} className="flex items-center justify-center gap-2 w-full mt-2 py-2 bg-gray-50 hover:bg-green-50 dark:bg-gray-800 dark:hover:bg-green-900/30 text-gray-700 hover:text-green-700 dark:text-gray-300 dark:hover:text-green-400 text-sm font-bold rounded-lg transition-colors border dark:border-gray-600">
                     <PhoneCall className="w-4 h-4" /> ខលឥឡូវនេះ
                   </a>
                 )}
               </div>
             ))}
          </div>
        </div>

        {/* Map Container */}
        <div className="flex-1 relative">
          <div ref={mapRef} className="w-full h-full" />
          
          {/* Map Controls Overlay */}
          <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
            <button onClick={recenterMap} className="bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 p-3 rounded-full shadow-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors group relative">
              <Crosshair className="w-6 h-6 group-hover:scale-110 transition-transform" />
            </button>
            {isAdmin && (
              <button onClick={handleInitiateAddDetail} className="bg-blue-600 text-white p-3 rounded-full shadow-lg hover:bg-blue-700 transition-all hover:scale-105">
                <Plus className="w-6 h-6" />
              </button>
            )}
          </div>

          {/* GPS Status Floating Badge */}
          <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 bg-white/90 dark:bg-gray-800/90 backdrop-blur px-4 py-2 rounded-full shadow-lg border border-gray-100 dark:border-gray-700 flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200 z-10 pointer-events-none transition-all">
            <div className={`w-2.5 h-2.5 rounded-full ${userLocation ? 'bg-green-500 animate-pulse' : 'bg-orange-500 animate-pulse'}`}></div>
            {gpsStatus}
          </div>
        </div>
      </div>

      {/* Admin Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl w-full max-w-sm shadow-2xl">
            <h3 className="text-xl font-bold mb-4 dark:text-white flex items-center gap-2">
              <Shield className="w-6 h-6 text-blue-500" /> Admin Access
            </h3>
            <input
              type="password"
              placeholder="លេខសម្ងាត់អ្នកគ្រប់គ្រង..."
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              className="w-full p-3 border dark:border-gray-600 rounded-xl mb-4 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-blue-500 dark:text-white"
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdminLogin(); }}
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowPasswordModal(false)} className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">បោះបង់</button>
              <button onClick={handleAdminLogin} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-md">បញ្ជាក់</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Detail Modal */}
      {showAddModal && pendingLocation && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl w-full max-w-md shadow-2xl my-8">
            <div className="flex justify-between items-center mb-5 pb-3 border-b dark:border-gray-700">
              <h3 className="text-xl font-bold dark:text-white flex items-center gap-2">
                <MapPin className="text-blue-500" /> បន្ថែមទិន្នន័យទីតាំងថ្មី
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-1.5 dark:text-gray-300">ឈ្មោះស្ថាប័ន ឬបុគ្គល</label>
                <input
                  type="text"
                  placeholder="ឧ. សាលាបឋមសិក្សា..."
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full p-3 border dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-blue-500 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1.5 dark:text-gray-300">លេខទូរស័ព្ទទំនាក់ទំនង</label>
                <input
                  type="tel"
                  placeholder="012 345 678"
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  className="w-full p-3 border dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-blue-500 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1.5 dark:text-gray-300">ប្រភេទស្ថាប័ន</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({...formData, type: e.target.value})}
                  className="w-full p-3 border dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-blue-500 dark:text-white"
                >
                  <option value="សាលារៀន / នាយកសាលា">សាលារៀន / នាយកសាលា</option>
                  <option value="មន្ទីរពេទ្យ / គ្លីនិក">មន្ទីរពេទ្យ / គ្លីនិក</option>
                  <option value="ប៉ុស្តិ៍ប៉ូលីស">ប៉ុស្តិ៍ប៉ូលីស</option>
                  <option value="សាលាឃុំ / ផ្ទះមេភូមិ">សាលាឃុំ / ផ្ទះមេភូមិ</option>
                </select>
              </div>
              <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg flex items-center gap-3 text-sm text-blue-800 dark:text-blue-300 border border-blue-100 dark:border-blue-800">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <p>ទីតាំងនឹងត្រូវកំណត់យកកន្លែងដែលអ្នកកំពុងឈរផ្ទាល់ (GPS)​​ ឬ​ ទីតាំងដែលអ្នកបានចង្អុលលើផែនទី។</p>
              </div>
            </div>
            <button onClick={saveLocation} className="w-full mt-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg flex justify-center items-center gap-2">
              <Save className="w-5 h-5" /> រក្សាទុកទិន្នន័យ
            </button>
          </div>
        </div>
      )}

      {/* Hidden File Input for Image Scanner */}
      <input type="file" accept="image/jpeg, image/png, image/jpg" ref={fileInputRef} className="hidden" onChange={handleImageUpload} />

      {/* Scanner Modal */}
      {showScannerModal && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-sm w-full p-6 text-center relative overflow-hidden shadow-2xl">
                <h3 className="text-xl font-bold mb-4 dark:text-white flex items-center justify-center gap-2">
                    <Camera className="w-6 h-6 text-blue-500" /> ស្កេនទីតាំងពីរូបភាព
                </h3>
                {scannedImage && (
                    <div className="relative rounded-lg overflow-hidden border-4 border-gray-100 dark:border-gray-700 mb-4 h-64 bg-gray-900">
                        <img src={scannedImage} alt="Scanned" className="w-full h-full object-contain" />
                        {isScanning && <div className="scanner-line"></div>}
                    </div>
                )}
                {isScanning ? (
                    <p className="text-gray-600 dark:text-gray-300 flex items-center justify-center gap-2">
                        <Loader2 className="w-5 h-5 animate-spin text-blue-500" /> កំពុងទាញយក GPS...
                    </p>
                ) : (
                    <button onClick={() => setShowScannerModal(false)} className="w-full py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white rounded-lg font-medium hover:bg-gray-300 transition-colors">បិទ</button>
                )}
            </div>
        </div>
      )}

      {/* AI Chat Bot */}
      {isAiOpen && (
        <div className="fixed bottom-4 right-4 w-[90vw] md:w-96 h-[80vh] md:h-[500px] bg-white dark:bg-gray-800 rounded-2xl shadow-2xl z-50 flex flex-col border dark:border-gray-700 overflow-hidden transform transition-all">
            {/* AI Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-blue-600 p-4 flex justify-between items-center text-white shrink-0">
                <div className="flex items-center gap-2">
                    <div className="bg-white/20 p-1.5 rounded-lg"><BrainCircuit className="w-5 h-5" /></div>
                    <h3 className="font-bold">SmartMap AI Assistant</h3>
                </div>
                <button onClick={() => setIsAiOpen(false)} className="text-white/80 hover:text-white hover:bg-white/20 p-1 rounded-md transition-colors">
                    <X className="w-5 h-5" />
                </button>
            </div>
            
            {/* AI Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-gray-900 custom-scrollbar">
                {chatMessages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] p-3 rounded-2xl shadow-sm text-sm ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white dark:bg-gray-800 dark:text-gray-200 border dark:border-gray-700 rounded-bl-none'}`}>
                            {msg.text}
                        </div>
                    </div>
                ))}
                {isAiTyping && (
                    <div className="flex justify-start">
                        <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 p-4 rounded-2xl rounded-bl-none shadow-sm flex gap-1.5 items-center">
                            <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: "0.2s"}}></div>
                            <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{animationDelay: "0.4s"}}></div>
                        </div>
                    </div>
                )}
                <div ref={chatEndRef} />
            </div>

            {/* AI Input */}
            <form onSubmit={handleAiSubmit} className="p-3 bg-white dark:bg-gray-800 border-t dark:border-gray-700 flex gap-2 shrink-0">
                <input
                    type="text"
                    placeholder="សួរអ្វីមួយទៅកាន់ AI..."
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    className="flex-1 p-2.5 bg-gray-100 dark:bg-gray-900 border border-transparent focus:border-blue-300 dark:focus:border-blue-700 rounded-xl focus:outline-none dark:text-white text-sm transition-colors"
                />
                <button type="submit" disabled={isAiTyping || !aiInput.trim()} className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white p-2.5 rounded-xl shadow-md transition-all">
                    <Send className="w-5 h-5" />
                </button>
            </form>
        </div>
      )}

      {/* Toast Notification */}
      {toast.show && (
        <div className={`fixed bottom-8 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-xl shadow-2xl text-white font-medium z-[100] flex items-center gap-2 transition-all ${toast.type === 'error' ? 'bg-red-500' : 'bg-gray-900 dark:bg-white dark:text-gray-900'}`}>
          {toast.type === 'error' ? <AlertCircle className="w-5 h-5" /> : <Save className="w-5 h-5" />}
          {toast.message}
        </div>
      )}
    </div>
  );
}