import { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, Building2, Users, User, Phone, Mail, ArrowRight, Loader2, X, ChevronRight, Search, RefreshCw, Layers, GripVertical } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Store } from '../store';
import type { Page } from './Sidebar';
import L from 'leaflet';

// Fix Leaflet default marker icons (webpack/vite issue)
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

interface DotMapOwner {
  owner: string;
  contact: string;
  phone: string;
  address: string;
  market: string;
  source: string;
}

interface Property {
  key: string;
  name: string;
  address: string;
  submarket: string;
  landlords: ContactEntry[];
  tenants: ContactEntry[];
  buyers: ContactEntry[];
  dotMapOwners: DotMapOwner[];
  totalContacts: number;
  lat: number | null;
  lng: number | null;
}

interface ContactEntry {
  id: string;
  name: string;
  company: string;
  phone: string;
  email: string;
  priority: string;
}

interface PropertyMapProps {
  store: Store;
  onNavigateToContact?: (contactId: string) => void;
}

// Custom marker icons by type — larger default sizes for satellite visibility
function createMarkerIcon(color: string, size: number = 16) {
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      width: ${size}px; height: ${size}px;
      background: ${color};
      border: 2.5px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 6px rgba(0,0,0,0.45);
      cursor: grab;
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export function PropertyMap({ store, onNavigateToContact }: PropertyMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<L.Map | null>(null);
  const markersLayer = useRef<L.LayerGroup | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [geocodeStatus, setGeocodeStatus] = useState({ cached: 0, total: 0, percent: 0, inProgress: false });
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [search, setSearch] = useState('');
  const [submarketFilter, setSubmarketFilter] = useState('all');

  // Load properties
  const loadProperties = useCallback(async () => {
    const token = localStorage.getItem('crm_token') || '';
    try {
      const res = await fetch('/api/map/properties', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      setProperties(data.properties || []);
    } catch (err) {
      console.error('Failed to load properties:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Check geocode status
  const checkGeocodeStatus = useCallback(async () => {
    const token = localStorage.getItem('crm_token') || '';
    try {
      const res = await fetch('/api/map/geocode-status', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      setGeocodeStatus(data);
    } catch {}
  }, []);

  // Start geocoding
  const startGeocoding = async () => {
    const token = localStorage.getItem('crm_token') || '';
    try {
      await fetch('/api/map/geocode', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({}),
      });
      setGeocodeStatus(prev => ({ ...prev, inProgress: true }));
    } catch {}
  };

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || leafletMap.current) return;

    // Seattle Eastside center
    leafletMap.current = L.map(mapRef.current, {
      center: [47.62, -122.15],
      zoom: 11,
      zoomControl: true,
    });

    // Satellite imagery from Esri
    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: '&copy; Esri, Maxar, Earthstar Geographics',
      maxZoom: 19,
    });

    // Street labels overlay on top of satellite
    const labels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
    });

    // Standard street map as alternate
    const streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    });

    // Default to satellite + labels
    satellite.addTo(leafletMap.current);
    labels.addTo(leafletMap.current);

    // Layer toggle control
    L.control.layers(
      { 'Satellite': satellite, 'Street Map': streets },
      { 'Street Labels': labels },
      { position: 'topright', collapsed: true }
    ).addTo(leafletMap.current);

    markersLayer.current = L.layerGroup().addTo(leafletMap.current);

    return () => {
      leafletMap.current?.remove();
      leafletMap.current = null;
    };
  }, []);

  // Load data on mount
  useEffect(() => {
    loadProperties();
    checkGeocodeStatus();
  }, []);

  // Poll geocode status while in progress
  useEffect(() => {
    if (!geocodeStatus.inProgress) return;
    const interval = setInterval(() => {
      checkGeocodeStatus();
      loadProperties(); // Refresh properties to get new coordinates
    }, 10000);
    return () => clearInterval(interval);
  }, [geocodeStatus.inProgress]);

  // Get unique submarkets
  const submarkets = [...new Set(properties.map(p => p.submarket).filter(Boolean))].sort();

  // Filter properties
  const filtered = properties.filter(p => {
    if (submarketFilter !== 'all' && p.submarket !== submarketFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        p.address.toLowerCase().includes(q) ||
        p.submarket.toLowerCase().includes(q) ||
        p.landlords.some(l => l.name.toLowerCase().includes(q) || l.company.toLowerCase().includes(q)) ||
        p.tenants.some(t => t.name.toLowerCase().includes(q) || t.company.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const geocodedFiltered = filtered.filter(p => p.lat && p.lng);

  // Update markers when properties or filters change
  useEffect(() => {
    if (!markersLayer.current || !leafletMap.current) return;

    markersLayer.current.clearLayers();

    geocodedFiltered.forEach(property => {
      if (!property.lat || !property.lng) return;

      // Determine color based on property contents
      const hasLandlord = property.landlords.length > 0;
      const hasTenants = property.tenants.length > 0;
      const totalContacts = property.totalContacts;

      let color = '#6b7280'; // gray for unknown
      if (hasLandlord && hasTenants) color = '#2563eb'; // blue for both
      else if (hasLandlord) color = '#7c3aed'; // purple for landlord only
      else if (hasTenants) color = '#059669'; // green for tenants only

      // Larger pins — scale from 16px up to 22px based on contact count
      const size = totalContacts > 5 ? 22 : totalContacts > 2 ? 18 : 16;

      const marker = L.marker([property.lat, property.lng], {
        icon: createMarkerIcon(color, size),
        draggable: true,
      });

      marker.on('click', () => {
        setSelectedProperty(property);
      });

      // Save new position when pin is dragged
      marker.on('dragend', async () => {
        const pos = marker.getLatLng();
        const token = localStorage.getItem('crm_token') || '';
        try {
          await fetch('/api/map/update-pin', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              addressKey: (property.address || '').toLowerCase().trim(),
              lat: pos.lat,
              lng: pos.lng,
            }),
          });
          // Update local state so panel reflects new coords
          property.lat = pos.lat;
          property.lng = pos.lng;
        } catch (err) {
          console.error('Failed to save pin position:', err);
        }
      });

      // Tooltip on hover
      marker.bindTooltip(`
        <div style="font-size:12px;max-width:220px">
          <strong style="color:#fff;text-shadow:0 1px 2px rgba(0,0,0,0.7)">${property.name || 'Unknown Property'}</strong><br/>
          <span style="color:#ddd;text-shadow:0 1px 2px rgba(0,0,0,0.7)">${property.address}</span><br/>
          <span style="color:#bbb;text-shadow:0 1px 2px rgba(0,0,0,0.7)">${property.landlords.length} landlord${property.landlords.length !== 1 ? 's' : ''} · ${property.tenants.length} tenant${property.tenants.length !== 1 ? 's' : ''}</span>
        </div>
      `, {
        direction: 'top',
        offset: [0, -8],
        className: 'satellite-tooltip',
      });

      markersLayer.current!.addLayer(marker);
    });
  }, [geocodedFiltered]);

  return (
    <div className="flex h-full">
      {/* Map */}
      <div className="flex-1 flex flex-col">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-2 bg-white border-b border-gray-200">
          <MapPin size={16} className="text-[hsl(215,65%,45%)]" />
          <span className="text-sm font-semibold">Property Map</span>
          <div className="flex-1" />

          <div className="relative w-64">
            <Search size={13} className="absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input
              placeholder="Search properties, tenants..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
          </div>

          <Select value={submarketFilter} onValueChange={setSubmarketFilter}>
            <SelectTrigger className="h-9 text-xs w-auto min-w-[130px]">
              <SelectValue placeholder="Submarket" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Submarkets</SelectItem>
              {submarkets.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#2563eb]" /> Both</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#7c3aed]" /> Landlord</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#059669]" /> Tenants</span>
          </div>

          <div className="text-xs text-muted-foreground">
            {geocodedFiltered.length} pins
          </div>
        </div>

        {/* Geocoding banner */}
        {geocodeStatus.percent < 100 && !loading && (
          <div className="flex items-center gap-3 px-4 py-2 bg-amber-50 border-b border-amber-200 text-sm">
            {geocodeStatus.inProgress ? (
              <>
                <Loader2 size={14} className="animate-spin text-amber-600" />
                <span className="text-amber-800">
                  Geocoding addresses... {geocodeStatus.cached}/{geocodeStatus.total} ({geocodeStatus.percent}%)
                </span>
                <Button size="sm" variant="outline" className="h-7 text-xs ml-auto" onClick={() => { checkGeocodeStatus(); loadProperties(); }}>
                  <RefreshCw size={11} className="mr-1" /> Refresh Map
                </Button>
              </>
            ) : (
              <>
                <MapPin size={14} className="text-amber-600" />
                <span className="text-amber-800">
                  {geocodeStatus.cached} of {geocodeStatus.total} addresses geocoded ({geocodeStatus.percent}%)
                </span>
                <Button size="sm" className="h-7 text-xs ml-auto bg-amber-600 hover:bg-amber-700" onClick={startGeocoding}>
                  Start Geocoding
                </Button>
              </>
            )}
          </div>
        )}

        {/* Map container */}
        <div ref={mapRef} className="flex-1" style={{ minHeight: 0 }} />

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-[500]">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 size={16} className="animate-spin" /> Loading properties...
            </div>
          </div>
        )}
      </div>

      {/* Property Detail Panel */}
      {selectedProperty && (
        <div className="w-[380px] border-l border-gray-200 bg-white overflow-y-auto">
          <div className="p-4 space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-base leading-tight">{selectedProperty.name || 'Unknown Property'}</h3>
                <div className="text-xs text-muted-foreground mt-1">{selectedProperty.address}</div>
                {selectedProperty.submarket && (
                  <Badge variant="secondary" className="mt-1.5 text-[10px]">{selectedProperty.submarket}</Badge>
                )}
              </div>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setSelectedProperty(null)}>
                <X size={14} />
              </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-purple-50 rounded-lg p-2 text-center">
                <div className="text-lg font-bold text-purple-700">{selectedProperty.landlords.length}</div>
                <div className="text-[10px] text-purple-600">Landlords</div>
              </div>
              <div className="bg-green-50 rounded-lg p-2 text-center">
                <div className="text-lg font-bold text-green-700">{selectedProperty.tenants.length}</div>
                <div className="text-[10px] text-green-600">Tenants</div>
              </div>
              <div className="bg-blue-50 rounded-lg p-2 text-center">
                <div className="text-lg font-bold text-blue-700">{selectedProperty.totalContacts}</div>
                <div className="text-[10px] text-blue-600">Total</div>
              </div>
            </div>

            {/* Landlords from CRM */}
            {selectedProperty.landlords.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Building2 size={12} /> Landlords / Owners
                </h4>
                <div className="space-y-1.5">
                  {selectedProperty.landlords.map(l => (
                    <ContactCard key={l.id} contact={l} color="purple" onNavigate={onNavigateToContact} />
                  ))}
                </div>
              </div>
            )}

            {/* Dot Map Ownership Data (from spreadsheets) */}
            {selectedProperty.dotMapOwners && selectedProperty.dotMapOwners.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-orange-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Building2 size={12} />
                  {selectedProperty.landlords.length > 0 ? 'Additional Ownership Records' : 'Ownership (Dot Map Records)'}
                </h4>
                <div className="space-y-1.5">
                  {selectedProperty.dotMapOwners.map((o, i) => (
                    <div
                      key={`dotmap-${i}`}
                      className="p-2.5 rounded-lg border-l-[3px] border-l-orange-400 bg-white border border-gray-100"
                    >
                      <div className="text-sm font-medium text-orange-800">{o.owner}</div>
                      {o.contact && <div className="text-[11px] text-muted-foreground">{o.contact}</div>}
                      {o.phone && (
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Phone size={9} /> {o.phone}
                        </div>
                      )}
                      {o.address && (
                        <div className="text-[10px] text-gray-400 mt-0.5">{o.address}</div>
                      )}
                      <div className="text-[9px] text-gray-300 mt-1 italic">Source: {o.source === 'dot_maps_2022' ? 'Dot Maps 2022' : 'Dot Maps 2019'}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* No ownership data at all */}
            {selectedProperty.landlords.length === 0 && (!selectedProperty.dotMapOwners || selectedProperty.dotMapOwners.length === 0) && (
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="text-xs text-gray-400">No ownership data available</div>
              </div>
            )}

            {/* Tenants */}
            {selectedProperty.tenants.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Users size={12} /> Tenants ({selectedProperty.tenants.length})
                </h4>
                <div className="space-y-1.5">
                  {selectedProperty.tenants.map(t => (
                    <ContactCard key={t.id} contact={t} color="green" onNavigate={onNavigateToContact} />
                  ))}
                </div>
              </div>
            )}

            {/* Buyers */}
            {selectedProperty.buyers.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <User size={12} /> Buyers ({selectedProperty.buyers.length})
                </h4>
                <div className="space-y-1.5">
                  {selectedProperty.buyers.map(b => (
                    <ContactCard key={b.id} contact={b} color="amber" onNavigate={onNavigateToContact} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ContactCard({ contact, color, onNavigate }: {
  contact: ContactEntry; color: string; onNavigate?: (id: string) => void;
}) {
  const colorMap: Record<string, string> = {
    purple: 'border-l-purple-400 hover:bg-purple-50/50',
    green: 'border-l-green-400 hover:bg-green-50/50',
    amber: 'border-l-amber-400 hover:bg-amber-50/50',
    blue: 'border-l-blue-400 hover:bg-blue-50/50',
  };

  return (
    <div
      onClick={() => onNavigate?.(contact.id)}
      className={`flex items-center gap-3 p-2.5 rounded-lg border-l-[3px] bg-white border border-gray-100 cursor-pointer transition-colors ${colorMap[color] || ''}`}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-[hsl(215,65%,45%)]">{contact.name}</div>
        <div className="text-[11px] text-muted-foreground truncate">{contact.company}</div>
        {contact.phone && (
          <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
            <Phone size={9} /> {contact.phone}
          </div>
        )}
      </div>
      <ChevronRight size={14} className="text-muted-foreground flex-shrink-0" />
    </div>
  );
}
