import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  MapPin, Moon, Sun, Search, X, Save, Trash2, Shield, User, Info, 
  Map as MapIcon, Loader2, Navigation, PhoneCall, Plus, Menu, Eye, 
  EyeOff, AlertCircle 
} from 'lucide-react';

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, deleteDoc, onSnapshot, collection } from 'firebase/firestore';

// 1. Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyBq_1YKH4Hf4M65qMHirvWCD_-tyqCDz5E",
  authDomain: "ramit-7e364.firebaseapp.com",
  projectId: "ramit-7e364",
  storageBucket: "ramit-7e364.firebasestorage.app",
  messagingSenderId: "1036691345731",
  appId: "1:1036691345731:web:df8121852c6137e3b35ff6",
  measurementId: "G-99Y1VSYHJG"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'smart-map-app-kh'; 

// ចម្ងាយ (Distance Calculator)
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

export default function App() {
  const [map, setMap] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [authUser, setAuthUser] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 768); 
  const [showDistances, setShowDistances] = useState(true);
  const [searchQuery, setSearchQuery] = useState(''); 
  const [authError, setAuthError] = useState(null); 
  
  // Data States
  const [firebaseLocations, setFirebaseLocations] = useState([]); 
  const [osmLocations, setOsmLocations] = useState([]); 
  const [lastFetchedPos, setLastFetchedPos] = useState(null); 
  const [isFetchingPois, setIsFetchingPois] = useState(false); 

  const [markers, setMarkers] = useState([]);
  const [userLocation, setUserLocation] = useState(null); 
  const [gpsStatus, setGpsStatus] = useState('កំពុងស្វែងរក GPS...'); 
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [pendingLocation, setPendingLocation] = useState(null);
  const [formData, setFormData] = useState({ name: '', phone: '', type: 'សាលារៀន / នាយកសាលា' });
  const [isAutoLocating, setIsAutoLocating] = useState(false);
  
  // បន្ថែម State សម្រាប់ប្រព័ន្ធស្វែងរកពិភពលោក (Global Search)
  const [searchResults, setSearchResults] = useState([]); 
  const [isSearching, setIsSearching] = useState(false); 
  const [searchLoading, setSearchLoading] = useState(false); 
  const searchTimeoutRef = useRef(null); 
  const searchDropdownRef = useRef(null); 

  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  const mapRef = useRef(null);
  const infoWindowRef = useRef(null);
  const userMarkerRef = useRef(null);
  const isMapCenteredRef = useRef(false);
  const watchIdRef = useRef(null); // Added for cleanup

  useEffect(() => {
    document.title = "📍 SmartMap";
    
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          try {
            await signInWithCustomToken(auth, __initial_auth_token);
          } catch (tokenError) {
            console.warn("Custom token mismatch, falling back to anonymous auth.");
            await signInAnonymously(auth);
          }
        } else {
          await signInAnonymously(auth);
        }
        setAuthError(null);
      } catch (error) {
        console.error("Auth error:", error);
        setAuthError(error.message);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!authUser) return;
    
    // Listen to Firebase Collection "ramit"
    const locRef = collection(db, 'artifacts', appId, 'public', 'data', 'ramit');
    const unsub = onSnapshot(locRef, (snapshot) => {
      const locList = [];
      snapshot.forEach(doc => {
        locList.push({ id: doc.id, isAdminData: true, ...doc.data() });
      });
      setFirebaseLocations(locList);
    }, (error) => {
      console.error("Error fetching locations:", error);
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

  useEffect(() => {
    if (!document.getElementById('google-maps-script')) {
      const script = document.createElement('script');
      script.id = 'google-maps-script';
      script.src = `https://maps.googleapis.com/maps/api/js?key=AIzaSyDcelrKRrV4GaPKftfT29JzuFsOuLk5CO8`;
      script.async = true;
      script.defer = true;
      script.onload = initializeMap;
      document.head.appendChild(script);
    } else if (window.google && window.google.maps) {
      initializeMap();
    }

    return () => {
        // Cleanup GPS Watcher on unmount
        if (watchIdRef.current && navigator.geolocation) {
            navigator.geolocation.clearWatch(watchIdRef.current);
        }
    };
  }, []);

  const fetchNearbyPOIs = async (lat, lng) => {
      setIsFetchingPois(true);
      try {
          // Query Overpass within 5km
          const query = `
              [out:json][timeout:25];
              (
                node["amenity"~"school|kindergarten"](around:5000,${lat},${lng});
                node["amenity"~"hospital|clinic|doctors"](around:5000,${lat},${lng});
                node["amenity"="police"](around:5000,${lat},${lng});
                node["office"="government"](around:5000,${lat},${lng});
                node["place"~"village|townhall"](around:5000,${lat},${lng});
              );
              out body;
          `;
          const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
          const response = await fetch(url);
          const data = await response.json();
          
          if (data && data.elements) {
              const formattedPOIs = data.elements.filter(e => e.tags && e.tags.name).map(el => {
                  let type = "ទីតាំងផ្សេងៗ";
                  let amenity = el.tags.amenity || el.tags.office || el.tags.place;
                  
                  if (amenity === 'school' || amenity === 'kindergarten') type = "សាលារៀន";
                  else if (amenity === 'hospital' || amenity === 'clinic' || amenity === 'doctors') type = "មន្ទីរពេទ្យ / គ្លីនិក";
                  else if (amenity === 'police') type = "ប៉ុស្តិ៍ប៉ូលីស";
                  else if (amenity === 'government' || amenity === 'townhall') type = "សាលាឃុំ / ផ្ទះមេភូមិ";
                  else if (amenity === 'village') type = "ភូមិ / សហគមន៍";

                  return {
                      id: `osm-${el.id}`,
                      name: el.tags.name,
                      type: type,
                      lat: el.lat,
                      lng: el.lon,
                      isAdminData: false 
                  };
              });
              setOsmLocations(formattedPOIs);
          }
      } catch (error) {
          console.error("Failed to fetch nearby POIs", error);
      } finally {
          setIsFetchingPois(false);
      }
  };

  const initializeMap = () => {
    if (!mapRef.current || !window.google || !window.google.maps) return;
    const initialMap = new window.google.maps.Map(mapRef.current, {
      center: { lat: 11.5564, lng: 104.9282 }, 
      zoom: 15,
      minZoom: 6, 
      mapTypeControl: true,
      zoomControl: true,
      gestureHandling: 'greedy', 
    });

    infoWindowRef.current = new window.google.maps.InfoWindow();
    initialMap.addListener("click", () => { if (infoWindowRef.current) infoWindowRef.current.close(); });

    if (navigator.geolocation) {
       watchIdRef.current = navigator.geolocation.watchPosition((position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          const userPos = { lat, lng };
          
          setUserLocation(userPos); 
          setGpsStatus('ចាប់បានទីតាំងរបស់អ្នក (Live)');
          
          if (!isMapCenteredRef.current) {
             initialMap.setCenter(userPos);
             initialMap.setZoom(16);
             isMapCenteredRef.current = true;
          } else {
             // Pan gently instead of harsh jumping
             initialMap.panTo(userPos);
          }
          
          if (userMarkerRef.current) {
              userMarkerRef.current.setPosition(userPos);
          } else {
              userMarkerRef.current = new window.google.maps.Marker({
                 position: userPos,
                 map: initialMap,
                 icon: {
                    path: window.google.maps.SymbolPath.CIRCLE,
                    scale: 9,
                    fillColor: '#4285F4',
                    fillOpacity: 1,
                    strokeColor: 'white',
                    strokeWeight: 2,
                 },
                 title: "អ្នកកំពុងនៅទីនេះ",
                 zIndex: 999
              });
          }

          // Fetch external POIs if moved more than 300 meters
          setLastFetchedPos(prev => {
              if (!prev || calculateDistance(prev.lat, prev.lng, lat, lng) > 0.3) {
                  fetchNearbyPOIs(lat, lng);
                  return userPos;
              }
              return prev;
          });

       }, (error) => {
          setGpsStatus('មិនអាចចាប់ទីតាំងបាន (សូមបើក GPS)');
       }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 });
    } else {
       setGpsStatus('ទូរស័ព្ទ/កម្មវិធី មិនគាំទ្រ GPS');
    }

    setMap(initialMap);
  };

  useEffect(() => {
    if (map && window.google && window.google.maps) {
      map.setOptions({ styles: isDarkMode ? darkMapStyle : [] });
    }
  }, [isDarkMode, map]);

  // Merge Firebase + Auto Data (Exclude Auto duplicates if within 100m of Firebase data)
  const allLocationsForMap = useMemo(() => {
      const filteredOsm = osmLocations.filter(osmLoc => {
          const isTooClose = firebaseLocations.some(fbLoc => 
              calculateDistance(osmLoc.lat, osmLoc.lng, fbLoc.lat, fbLoc.lng) < 0.1 
          );
          return !isTooClose;
      });
      return [...firebaseLocations, ...filteredOsm];
  }, [firebaseLocations, osmLocations]);

  // Sync Markers to Map
  useEffect(() => {
    if (!map || !window.google || !window.google.maps) return;

    markers.forEach(m => {
        if (m && m.marker && typeof m.marker.setMap === 'function') m.marker.setMap(null);
    });
    
    const newMarkers = [];

    allLocationsForMap.forEach(loc => {
      let iconUrl = loc.isAdminData 
          ? "http://maps.google.com/mapfiles/ms/icons/green-dot.png" 
          : "http://maps.google.com/mapfiles/ms/icons/purple-dot.png"; 

      const marker = new window.google.maps.Marker({
        position: { lat: loc.lat, lng: loc.lng },
        map: map,
        title: loc.name,
        icon: iconUrl,
        animation: window.google.maps.Animation.DROP
      });

      marker.addListener("click", () => focusLocation(loc, marker));
      newMarkers.push({ id: loc.id, marker });
    });

    setMarkers(newMarkers);
    
    return () => newMarkers.forEach(m => m.marker?.setMap(null));
  }, [map, allLocationsForMap]);

  // Distance Sort & Text Search filter
  const filteredAndSortedLocations = useMemo(() => {
      if (!allLocationsForMap) return [];
      
      const mappedLocs = allLocationsForMap.map(loc => {
          let distance = null;
          if (userLocation) distance = calculateDistance(userLocation.lat, userLocation.lng, loc.lat, loc.lng);
          return { ...loc, distance };
      });

      const searched = mappedLocs.filter(loc => {
         const query = searchQuery.toLowerCase().trim();
         if (!query) return true;
         return loc.name.toLowerCase().includes(query) || loc.type.toLowerCase().includes(query);
      });

      return searched.sort((a, b) => {
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

  // --- មុខងារស្វែងរកទីតាំងពិភពលោក (Global Map Search) ---
  const executeGlobalSearch = async (query) => {
    if (!query) return;
    setSearchLoading(true);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1`);
      const data = await response.json();
      const mappedData = data.map(place => ({
        id: place.place_id,
        name: place.display_name,
        lat: parseFloat(place.lat),
        lng: parseFloat(place.lon),
        boundingbox: place.boundingbox
      }));
      setSearchResults(mappedData);
      setIsSearching(true);
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSearchInput = (e) => {
    const val = e.target.value;
    setSearchQuery(val);
    
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    if (val.trim().length < 2) {
      setIsSearching(false);
      setSearchResults([]);
      return;
    }

    // រង់ចាំ 600ms ក្រោយឈប់វាយអក្សរ ទើបស្វែងរក (ការពារកុំឲ្យគាំង)
    searchTimeoutRef.current = setTimeout(() => {
      executeGlobalSearch(val.trim());
    }, 600);
  };

  const handleSearchKeyDown = async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (searchResults.length > 0) {
        handleSelectSearchResult(searchResults[0]);
      } else if (searchQuery.trim()) {
        executeGlobalSearch(searchQuery.trim());
      }
    }
  };

  const handleSelectSearchResult = (result) => {
    setSearchQuery(result.name.split(',')[0]); // ដាក់តែឈ្មោះខេត្ត/ស្រុក ក្នុងប្រអប់
    setIsSearching(false);
    setSearchResults([]);
    
    if(map && window.google) {
      // Zoom ទៅកាន់ទីតាំងនោះអូតូ
      if (result.boundingbox) {
         const bounds = new window.google.maps.LatLngBounds(
            { lat: parseFloat(result.boundingbox[0]), lng: parseFloat(result.boundingbox[2]) },
            { lat: parseFloat(result.boundingbox[1]), lng: parseFloat(result.boundingbox[3]) }
         );
         map.fitBounds(bounds);
      } else {
         map.panTo({ lat: result.lat, lng: result.lng });
         map.setZoom(16);
      }
      
      // ទម្លាក់ Pin បណ្ដោះអាសន្នបញ្ជាក់ទីតាំង
      const tempMarker = new window.google.maps.Marker({
          position: { lat: result.lat, lng: result.lng },
          map: map,
          icon: "http://maps.google.com/mapfiles/ms/icons/purple-dot.png",
          title: result.name,
          animation: window.google.maps.Animation.DROP
      });
      
      const tempInfoWindow = new window.google.maps.InfoWindow({
         content: `<div class="p-2 text-sm font-bold">${result.name}</div>`
      });
      tempInfoWindow.open(map, tempMarker);

      // លុប Pin បណ្ដោះអាសន្នវិញក្រោយ ៨វិនាទី
      setTimeout(() => {
          tempMarker.setMap(null);
      }, 8000); 
    }
  };
  
  // បិទផ្ទាំងបញ្ជីស្វែងរកពេលចុចចេញក្រៅ
  useEffect(() => {
    const handleClickOutside = (event) => {
        if (searchDropdownRef.current && !searchDropdownRef.current.contains(event.target)) {
            setIsSearching(false);
        }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const focusLocation = (loc, markerObj = null) => {
    if (!map || !infoWindowRef.current || !window.google) return;
    const pos = { lat: loc.lat, lng: loc.lng };
    map.panTo(pos);
    map.setZoom(17);
    if(window.innerWidth < 768) setIsSidebarOpen(false); // Close sidebar on mobile

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
    const newLoc = { ...formData, lat: pendingLocation.lat, lng: pendingLocation.lng, createdAt: Date.now() };

    try {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'ramit', newId), newLoc);
        setShowAddModal(false);
        showToast("រក្សាទុកជោគជ័យ!", "success");
    } catch (e) { 
        showToast("Error saving data", "error"); 
    }
  };

  const handleDeleteLocation = async (locId) => {
     try {
         await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'ramit', locId));
         showToast("បានលុបទិន្នន័យជោគជ័យ", "success");
     } catch (e) {
         showToast("Error deleting data", "error");
     }
  };

  const handleAdminLogin = () => {
    if (adminPassword === 'ict168') { 
        setIsAdmin(true);
        setShowPasswordModal(false);
        setAdminPassword('');
        showToast('ចូលជាអ្នកគ្រប់គ្រងដោយជោគជ័យ!', 'success');
    } else {
        showToast('លេខសម្ងាត់មិនត្រឹមត្រូវ!', 'error');
    }
  }

  const showToast = (msg, type) => {
    setToast({ show: true, message: msg, type });
    setTimeout(() => setToast(prev => ({ ...prev, show: false })), 4000);
  };

  return (
    <div className={`h-screen flex flex-col font-sans ${isDarkMode ? 'dark bg-gray-900 text-gray-100' : 'bg-gray-100 text-gray-800'} overflow-hidden`}>
      
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm z-20 p-3 flex justify-between items-center relative transition-colors duration-300">
        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="md:hidden p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
              <Menu className="w-6 h-6" />
          </button>
          <div className="bg-blue-600 text-white p-2 rounded-lg shadow-md hidden md:block">
            <MapIcon className="w-5 h-5" />
          </div>
          <h1 className="text-lg md:text-xl font-bold flex items-center gap-1 text-gray-800 dark:text-white">📍 SmartMap</h1>
        </div>

        <div className="flex-grow max-w-xs md:max-w-md mx-4 relative hidden sm:block" ref={searchDropdownRef}>
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            {searchLoading ? <Loader2 className="h-5 w-5 text-blue-500 animate-spin" /> : <Search className="h-5 w-5 text-gray-400" />}
          </div>
          <input
            type="text"
            placeholder="ស្វែងរក ខេត្ត ស្រុក ភូមិ ឬទីតាំង..."
            value={searchQuery}
            onChange={handleSearchInput}
            onKeyDown={handleSearchKeyDown}
            onFocus={() => { if(searchResults.length > 0) setIsSearching(true); }}
            className="block w-full pl-10 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-full bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all dark:text-white text-gray-900"
          />
          {searchQuery && (
            <button onClick={() => { setSearchQuery(''); setSearchResults([]); setIsSearching(false); }} className="absolute inset-y-0 right-0 pr-3 flex items-center">
              <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
            </button>
          )}

          {/* ផ្ទាំងទម្លាក់ (Dropdown) បង្ហាញលទ្ធផលស្វែងរក */}
          {isSearching && searchResults.length > 0 && (
            <ul className="absolute z-50 w-full mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl max-h-72 overflow-y-auto custom-scrollbar divide-y divide-gray-100 dark:divide-gray-700">
              {searchResults.map((result, idx) => (
                <li key={idx} onClick={() => handleSelectSearchResult(result)} className="px-4 py-3 hover:bg-blue-50 dark:hover:bg-gray-700 cursor-pointer flex items-start gap-3 transition-colors">
                  <div className="bg-gray-100 dark:bg-gray-700 p-2 rounded-full shrink-0 mt-0.5">
                      <MapPin className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className="flex flex-col">
                      <span className="font-bold text-sm text-gray-800 dark:text-gray-100">{result.name.split(',')[0]}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-tight">{result.name.substring(result.name.indexOf(',') + 1)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        
        {/* Header Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button 
             onClick={() => {
               setShowDistances(!showDistances);
               showToast(showDistances ? "បានលាក់ចម្ងាយ" : "បានបង្ហាញចម្ងាយ", "success");
             }} 
             className="p-2 rounded-full text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
             title="បិទ/បើក ការបង្ហាញចម្ងាយ"
          >
             {showDistances ? <Eye className="w-5 h-5 text-blue-500" /> : <EyeOff className="w-5 h-5" />}
          </button>
          
          <button 
             onClick={() => setIsDarkMode(!isDarkMode)} 
             className="p-2 rounded-full text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
          >
            {isDarkMode ? <Sun className="w-5 h-5 text-yellow-400" /> : <Moon className="w-5 h-5" />}
          </button>

          <button 
            onClick={() => isAdmin ? setIsAdmin(false) : setShowPasswordModal(true)}
            className={`p-2.5 rounded-full border transition-colors flex items-center justify-center ${isAdmin ? 'bg-green-100 text-green-700 border-green-300 dark:bg-green-900/40 dark:text-green-400' : 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-700 dark:text-gray-300'}`}
            title={isAdmin ? "ចាកចេញពី Admin" : "ចូលទៅកាន់ Admin"}
          >
            {isAdmin ? <Shield className="w-5 h-5" /> : <User className="w-5 h-5" />}
          </button>
        </div>
      </header>

      <main className="flex-grow flex relative overflow-hidden">
        
        {/* Left Sidebar */}
        <aside className={`w-[320px] md:w-80 bg-white dark:bg-gray-800 shadow-xl md:shadow-md flex flex-col h-full shrink-0 z-10 border-r dark:border-gray-700 absolute md:relative transform transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
          
          {isAdmin && (
            <div className="p-4 border-b dark:border-gray-700 bg-blue-50/50 dark:bg-blue-900/10">
                 <button 
                    onClick={handleInitiateAddDetail} disabled={isAutoLocating}
                    className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl flex items-center justify-center gap-2 font-bold shadow-md transition-all active:scale-95"
                 >
                    {isAutoLocating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                    បន្ថែមព័ត៌មានលម្អិតទីនេះ
                 </button>
            </div>
          )}

          <div className="p-4 pb-2 bg-gray-50 dark:bg-gray-800/50">
            <div className="flex justify-between items-center mb-1">
                <h2 className="text-sm font-bold flex items-center gap-2 text-gray-800 dark:text-gray-200">
                   <Navigation className="w-4 h-4 text-blue-500" /> ទីតាំងសំខាន់ៗជុំវិញអ្នក
                </h2>
                <div className="flex items-center gap-1.5 text-[10px] bg-white dark:bg-gray-700 px-2 py-1 rounded-full border shadow-sm dark:border-gray-600 dark:text-gray-300" title={gpsStatus}>
                    <div className={`w-2 h-2 rounded-full ${userLocation ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`}></div>
                    <span>{userLocation ? 'GPS ដំណើរការ' : 'ស្វែងរក...'}</span>
                </div>
            </div>
            <p className="text-[11px] text-gray-500 mt-1">ចាប់យកទិន្នន័យស្វ័យប្រវត្តិតាមការដើររបស់អ្នក។</p>
          </div>

          {/* List of Locations */}
          <div className="flex-grow overflow-y-auto px-4 pb-4 pt-2 custom-scrollbar bg-gray-50 dark:bg-gray-800/50">
            {isFetchingPois && filteredAndSortedLocations.length === 0 ? (
               <div className="flex flex-col items-center justify-center py-10 text-gray-500 dark:text-gray-400">
                  <Loader2 className="w-8 h-8 animate-spin mb-3 text-blue-500" />
                  <p className="text-sm font-medium">កំពុងទាញយកទីតាំងជុំវិញនេះអូតូ...</p>
               </div>
            ) : filteredAndSortedLocations.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-10">មិនទាន់រកឃើញទីតាំងនៅក្បែរនេះទេ</p>
            ) : (
              <ul className="space-y-3">
                {filteredAndSortedLocations.map((loc) => (
                  <li key={loc.id} onClick={() => focusLocation(loc)} className={`rounded-xl p-3.5 shadow-sm border cursor-pointer transition-all hover:-translate-y-0.5 ${loc.isAdminData ? 'bg-white dark:bg-gray-700 border-green-200 dark:border-green-800 hover:border-green-400 hover:shadow-md' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-blue-300'}`}>
                      
                      <div className="flex justify-between items-start mb-2">
                          <h3 className="font-bold text-[15px] flex items-center gap-1.5 text-gray-900 dark:text-white leading-tight pr-4">
                              {loc.isAdminData ? <span className="text-green-500 text-lg" title="ទិន្នន័យពី Admin">✅</span> : <span className="text-gray-400 text-lg" title="ទិន្នន័យអូតូពីផែនទី">📌</span>}
                              {loc.name}
                          </h3>
                          {loc.isAdminData && isAdmin && (
                              <button onClick={(e) => { e.stopPropagation(); handleDeleteLocation(loc.id); }} className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 p-1.5 rounded-full transition-colors shrink-0">
                                  <Trash2 className="w-4 h-4" />
                              </button>
                          )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/40 px-2 py-0.5 rounded-md border border-blue-100 dark:border-blue-800">
                              {loc.type}
                          </span>
                          {showDistances && loc.distance !== null && (
                              <span className="text-[11px] font-bold bg-gray-100 text-gray-600 dark:bg-gray-600 dark:text-gray-200 px-2 py-0.5 rounded-md border border-gray-200 dark:border-gray-500">
                                  {formatDistance(loc.distance)}
                              </span>
                          )}
                      </div>

                      {/* បង្ហាញព័ត៌មានលម្អិត បើជាទិន្នន័យ Admin */}
                      {loc.isAdminData ? (
                          <div className="mt-2.5 bg-green-50 dark:bg-green-900/20 p-2.5 rounded-lg border border-green-100 dark:border-green-800">
                             <p className="text-[13px] text-gray-700 dark:text-gray-300 font-medium mb-1">តួនាទី: <span className="font-bold text-gray-900 dark:text-white">{loc.type}</span></p>
                             <p className="text-[13px] text-gray-700 dark:text-gray-300 font-medium flex items-center gap-1">
                                📞 លេខទូរស័ព្ទ: <span className="font-bold text-blue-600 dark:text-blue-400">{loc.phone}</span>
                             </p>
                          </div>
                      ) : (
                          <div className="mt-2 flex items-center gap-1.5">
                             <AlertCircle className="w-3.5 h-3.5 text-orange-500" />
                             <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">មិនទាន់មានទិន្នន័យបន្ថែមពី Admin</p>
                          </div>
                      )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* Map Container */}
        <div className="flex-grow h-full relative z-0 bg-gray-200 dark:bg-gray-800">
          <div ref={mapRef} className="w-full h-full"></div>
          
          <button 
             onClick={() => { if (userLocation && map) { map.panTo(userLocation); map.setZoom(16); } }}
             className="absolute bottom-8 right-6 bg-white dark:bg-gray-800 p-3.5 rounded-full shadow-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 z-10 transition-transform active:scale-95 animate-pulse"
             title="ត្រលប់មកទីតាំងខ្ញុំវិញ"
          >
             <Navigation className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </button>
        </div>
      </main>

      {/* Admin Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 backdrop-blur-sm bg-black/40 flex items-center justify-center z-50 p-4 transition-all duration-300">
           <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl transform scale-100 border border-gray-100 dark:border-gray-700">
             
             <div className="flex items-center justify-between mb-6">
                 <h2 className="text-xl font-bold flex items-center gap-2 text-gray-800 dark:text-white">
                    <Shield className="text-blue-600 w-6 h-6"/> ចូលជាអ្នកគ្រប់គ្រង
                 </h2>
                 <button onClick={() => setShowPasswordModal(false)} className="text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 p-1.5 rounded-full transition-colors">
                    <X className="w-5 h-5" />
                 </button>
             </div>
             
             <div className="mb-6">
                 <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">លេខសម្ងាត់ (Password)</label>
                 <input 
                    type="password" 
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAdminLogin()}
                    placeholder="••••••••"
                    className="w-full p-3.5 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-900 dark:text-white transition-shadow shadow-inner"
                    autoFocus
                 />
             </div>
             
             <button 
                onClick={handleAdminLogin} 
                className="w-full py-3.5 bg-blue-600 text-white hover:bg-blue-700 rounded-xl font-bold shadow-md transition-all active:scale-95"
             >
                យល់ព្រម
             </button>
           </div>
        </div>
      )}

      {/* Add Location Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
           <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
             <h2 className="text-xl font-bold mb-1 text-gray-900 dark:text-white flex items-center gap-2">📍 បញ្ចូលព័ត៌មានលម្អិតទីតាំងនេះ</h2>
             <p className="text-sm text-gray-500 mb-5">ទីតាំងនេះនឹងត្រូវបានរក្សាទុក ហើយបង្ហាញពេលអ្នកនៅជិតទីនេះ។</p>
             
             <div className="space-y-4">
               <div>
                 <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ឈ្មោះស្ថាប័ន / បុគ្គល</label>
                 <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-3 border border-gray-300 rounded-xl dark:bg-gray-900 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white" placeholder="ឧ. សាលាបឋមសិក្សាបាដាក" />
               </div>
               <div>
                 <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">តួនាទី / ប្រភេទ</label>
                 <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})} className="w-full p-3 border border-gray-300 rounded-xl dark:bg-gray-900 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white">
                    <option value="សាលារៀន / នាយកសាលា">សាលារៀន / នាយកសាលា</option>
                    <option value="មេភូមិ">មេភូមិ</option>
                    <option value="មេឃុំ / សាលាឃុំ">មេឃុំ / សាលាឃុំ</option>
                    <option value="ប៉ុស្តិ៍ប៉ូលីស">ប៉ុស្តិ៍ប៉ូលីស</option>
                    <option value="មន្ទីរពេទ្យ / មណ្ឌលសុខភាព">មន្ទីរពេទ្យ / មណ្ឌលសុខភាព</option>
                 </select>
               </div>
               <div>
                 <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">លេខទូរស័ព្ទទំនាក់ទំនង</label>
                 <input type="tel" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full p-3 border border-gray-300 rounded-xl dark:bg-gray-900 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white font-mono" placeholder="012 345 678" />
               </div>
               <div className="flex justify-end gap-3 mt-6 pt-4 border-t dark:border-gray-700">
                 <button onClick={() => setShowAddModal(false)} className="px-5 py-2.5 text-gray-700 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 rounded-xl font-medium transition-colors">បោះបង់</button>
                 <button onClick={saveLocation} className="px-5 py-2.5 bg-blue-600 text-white hover:bg-blue-700 rounded-xl font-bold flex items-center gap-2 shadow-md transition-colors active:scale-95"><Save className="w-4 h-4"/> រក្សាទុកទីតាំង</button>
               </div>
             </div>
           </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast.show && (
        <div className={`absolute top-20 right-5 md:right-10 z-50 px-6 py-3.5 rounded-xl shadow-2xl text-white font-bold flex items-center gap-2 transform transition-all animate-bounce ${toast.type === 'error' ? 'bg-red-500' : 'bg-green-600'}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}