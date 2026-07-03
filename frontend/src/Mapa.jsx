import React, { useState, useEffect, useRef, useCallback } from "react";
import "./Mapa.css";

const NOMINATIM = "https://nominatim.openstreetmap.org";
const OSRM      = "https://router.project-osrm.org/route/v1/driving";
const COLORES   = ["#2DD4E8","#4ADE80","#F2A93B","#F87171","#A78BFA"];

export default function Mapa({ onVolver, busquedaInicial = null }) {
  const globeRef    = useRef(null);
  const leafletRef  = useRef(null);
  const mapRef      = useRef(null);
  const miUbicRef   = useRef(null);
  const rutasRef    = useRef([]);
  const marcRef     = useRef([]);
  const globeInst   = useRef(null);

  const [modo,       setModo]       = useState("globo"); // "globo" | "calles"
  const [query,      setQuery]      = useState("");
  const [buscando,   setBuscando]   = useState(false);
  const [error,      setError]      = useState(null);
  const [resultados, setResultados] = useState([]);
  const [rutas,      setRutas]      = useState([]);
  const [guardados,  setGuardados]  = useState([]);
  const [miPos,      setMiPos]      = useState(null);
  const [cargando,   setCargando]   = useState(true);
  const [destActual, setDestActual] = useState(null);
  const busquedaEjecutadaRef = useRef(false);

  // ── Cargar Globe.gl ───────────────────────────────────────────────────
  useEffect(() => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/globe.gl@2.27.2/dist/globe.gl.min.js";
    s.onload = () => initGlobe();
    document.head.appendChild(s);
    return () => { if (globeInst.current) globeInst.current._destructor?.(); };
  }, []);

  const initGlobe = () => {
    if (!globeRef.current || globeInst.current) return;
    const Globe = window.Globe;
    // Ciudades del mundo para labels (300+)
    const CIUDADES = [
      // América del Norte
      {lat:40.7128,lng:-74.006,nombre:"NEW YORK"},{lat:34.0522,lng:-118.2437,nombre:"LOS ANGELES"},
      {lat:41.8781,lng:-87.6298,nombre:"CHICAGO"},{lat:29.7604,lng:-95.3698,nombre:"HOUSTON"},
      {lat:33.749,lng:-84.388,nombre:"ATLANTA"},{lat:47.6062,lng:-122.3321,nombre:"SEATTLE"},
      {lat:37.7749,lng:-122.4194,nombre:"SAN FRANCISCO"},{lat:25.7617,lng:-80.1918,nombre:"MIAMI"},
      {lat:42.3601,lng:-71.0589,nombre:"BOSTON"},{lat:39.9526,lng:-75.1652,nombre:"PHILADELPHIA"},
      {lat:36.1699,lng:-115.1398,nombre:"LAS VEGAS"},{lat:33.4484,lng:-112.074,nombre:"PHOENIX"},
      {lat:32.7157,lng:-117.1611,nombre:"SAN DIEGO"},{lat:32.7767,lng:-96.797,nombre:"DALLAS"},
      {lat:29.4241,lng:-98.4936,nombre:"SAN ANTONIO"},{lat:35.2271,lng:-80.8431,nombre:"CHARLOTTE"},
      {lat:39.7392,lng:-104.9903,nombre:"DENVER"},{lat:38.9072,lng:-77.0369,nombre:"WASHINGTON DC"},
      {lat:45.5051,lng:-73.5543,nombre:"MONTREAL"},{lat:43.7,lng:-79.42,nombre:"TORONTO"},
      {lat:49.2827,lng:-123.1207,nombre:"VANCOUVER"},{lat:51.0447,lng:-114.0719,nombre:"CALGARY"},
      {lat:53.5461,lng:-113.4938,nombre:"EDMONTON"},{lat:45.4215,lng:-75.6972,nombre:"OTTAWA"},
      {lat:19.4326,lng:-99.1332,nombre:"CIUDAD DE MÉXICO"},{lat:25.6866,lng:-100.3161,nombre:"MONTERREY"},
      {lat:20.9674,lng:-89.5926,nombre:"MÉRIDA"},{lat:22.1565,lng:-100.9855,nombre:"SAN LUIS POTOSÍ"},
      {lat:21.1619,lng:-86.8515,nombre:"CANCÚN"},{lat:20.6597,lng:-103.3496,nombre:"GUADALAJARA"},
      {lat:19.0414,lng:-98.2063,nombre:"PUEBLA"},{lat:31.7219,lng:-106.4241,nombre:"CIUDAD JUÁREZ"},
      // América Central y Caribe
      {lat:23.1136,lng:-82.3666,nombre:"LA HABANA"},{lat:18.4655,lng:-66.1057,nombre:"SAN JUAN"},
      {lat:9.9281,lng:-84.0907,nombre:"SAN JOSÉ"},{lat:14.0723,lng:-87.202,nombre:"TEGUCIGALPA"},
      {lat:12.1328,lng:-86.2504,nombre:"MANAGUA"},{lat:13.6929,lng:-89.2182,nombre:"SAN SALVADOR"},
      {lat:14.6349,lng:-90.5069,nombre:"CIUDAD DE GUATEMALA"},{lat:8.9936,lng:-79.5197,nombre:"PANAMÁ"},
      {lat:18.5944,lng:-72.3074,nombre:"PORT-AU-PRINCE"},{lat:18.4746,lng:-69.9312,nombre:"SANTO DOMINGO"},
      {lat:17.9971,lng:-76.7936,nombre:"KINGSTON"},{lat:10.4806,lng:-61.4122,nombre:"PORT OF SPAIN"},
      // América del Sur
      {lat:-33.4489,lng:-70.6693,nombre:"SANTIAGO"},{lat:-23.5505,lng:-46.6333,nombre:"SÃO PAULO"},
      {lat:-34.6037,lng:-58.3816,nombre:"BUENOS AIRES"},{lat:-12.0464,lng:-77.0428,nombre:"LIMA"},
      {lat:-0.1807,lng:-78.4678,nombre:"QUITO"},{lat:4.711,lng:-74.0721,nombre:"BOGOTÁ"},
      {lat:10.4806,lng:-66.9036,nombre:"CARACAS"},{lat:-15.7801,lng:-47.9292,nombre:"BRASILIA"},
      {lat:-3.119,lng:-60.0217,nombre:"MANAOS"},{lat:-22.9068,lng:-43.1729,nombre:"RIO DE JANEIRO"},
      {lat:-31.4167,lng:-64.1833,nombre:"CÓRDOBA"},{lat:-17.3895,lng:-66.1568,nombre:"COCHABAMBA"},
      {lat:-25.2867,lng:-57.647,nombre:"ASUNCIÓN"},{lat:-34.9011,lng:-56.1645,nombre:"MONTEVIDEO"},
      {lat:-16.5,lng:-68.15,nombre:"LA PAZ"},{lat:-8.0476,lng:-34.877,nombre:"RECIFE"},
      {lat:-30.0346,lng:-51.2177,nombre:"PORTO ALEGRE"},{lat:-19.9167,lng:-43.9345,nombre:"BELO HORIZONTE"},
      {lat:-3.7172,lng:-38.5431,nombre:"FORTALEZA"},{lat:-12.9714,lng:-38.5014,nombre:"SALVADOR"},
      {lat:-1.4558,lng:-48.5044,nombre:"BELÉM"},{lat:-7.115,lng:-34.863,nombre:"JOÃO PESSOA"},
      {lat:-5.7793,lng:-35.2009,nombre:"NATAL"},{lat:-9.6498,lng:-35.7089,nombre:"MACEIÓ"},
      {lat:-20.3222,lng:-40.3381,nombre:"VITÓRIA"},{lat:-10.9472,lng:-37.0731,nombre:"ARACAJU"},
      {lat:-8.9099,lng:-63.0064,nombre:"PORTO VELHO"},{lat:-9.9754,lng:-67.8249,nombre:"RIO BRANCO"},
      {lat:5.8944,lng:-55.1747,nombre:"PARAMARIBO"},{lat:4.0024,lng:-52.6503,nombre:"CAYENA"},
      {lat:6.8013,lng:-58.1551,nombre:"GEORGETOWN"},{lat:-33.0472,lng:-71.6127,nombre:"VALPARAÍSO"},
      {lat:-36.8201,lng:-73.0444,nombre:"CONCEPCIÓN"},{lat:-45.5752,lng:-72.0662,nombre:"COYHAIQUE"},
      {lat:-53.1638,lng:-70.9171,nombre:"PUNTA ARENAS"},{lat:-27.3668,lng:-55.8964,nombre:"POSADAS"},
      {lat:-38.9516,lng:-68.0591,nombre:"NEUQUÉN"},{lat:-43.3002,lng:-65.1023,nombre:"COMODORO RIVADAVIA"},
      {lat:-24.1858,lng:-65.2995,nombre:"SAN SALVADOR DE JUJUY"},{lat:-31.4135,lng:-68.5861,nombre:"SAN JUAN"},
      // Europa Occidental
      {lat:51.5074,lng:-0.1278,nombre:"LONDON"},{lat:48.8566,lng:2.3522,nombre:"PARIS"},
      {lat:52.52,lng:13.405,nombre:"BERLIN"},{lat:41.9028,lng:12.4964,nombre:"ROME"},
      {lat:40.4168,lng:-3.7038,nombre:"MADRID"},{lat:48.2082,lng:16.3738,nombre:"VIENNA"},
      {lat:52.3676,lng:4.9041,nombre:"AMSTERDAM"},{lat:50.8503,lng:4.3517,nombre:"BRUSSELS"},
      {lat:47.3769,lng:8.5417,nombre:"ZÜRICH"},{lat:45.764,lng:4.8357,nombre:"LYON"},
      {lat:41.3851,lng:2.1734,nombre:"BARCELONA"},{lat:38.7223,lng:-9.1393,nombre:"LISBON"},
      {lat:53.3498,lng:-6.2603,nombre:"DUBLIN"},{lat:55.9533,lng:-3.1883,nombre:"EDINBURGH"},
      {lat:53.4808,lng:-2.2426,nombre:"MANCHESTER"},{lat:52.4862,lng:-1.8904,nombre:"BIRMINGHAM"},
      {lat:55.8642,lng:-4.2518,nombre:"GLASGOW"},{lat:51.4545,lng:-2.5879,nombre:"BRISTOL"},
      {lat:43.2965,lng:5.3698,nombre:"MARSEILLE"},{lat:47.2184,lng:-1.5536,nombre:"NANTES"},
      {lat:43.6047,lng:1.4442,nombre:"TOULOUSE"},{lat:44.8378,lng:-0.5792,nombre:"BORDEAUX"},
      {lat:48.5734,lng:7.7521,nombre:"STRASBOURG"},{lat:50.6292,lng:3.0573,nombre:"LILLE"},
      {lat:45.188,lng:5.7245,nombre:"GRENOBLE"},{lat:43.7102,lng:7.262,nombre:"NICE"},
      {lat:48.1173,lng:-1.6778,nombre:"RENNES"},{lat:49.4431,lng:1.0993,nombre:"ROUEN"},
      {lat:51.2277,lng:6.7735,nombre:"DÜSSELDORF"},{lat:53.5753,lng:10.0153,nombre:"HAMBURG"},
      {lat:48.1351,lng:11.582,nombre:"MUNICH"},{lat:50.9333,lng:6.95,nombre:"COLOGNE"},
      {lat:53.0793,lng:8.8017,nombre:"BREMEN"},{lat:51.4818,lng:7.2162,nombre:"DORTMUND"},
      {lat:51.3397,lng:12.3731,nombre:"LEIPZIG"},{lat:51.0504,lng:13.7373,nombre:"DRESDEN"},
      {lat:49.4521,lng:11.0767,nombre:"NUREMBERG"},{lat:49.0069,lng:8.4037,nombre:"KARLSRUHE"},
      {lat:45.4654,lng:9.1859,nombre:"MILAN"},{lat:40.8518,lng:14.2681,nombre:"NAPLES"},
      {lat:45.4408,lng:12.3155,nombre:"VENICE"},{lat:43.7696,lng:11.2558,nombre:"FLORENCE"},
      {lat:45.0703,lng:7.6869,nombre:"TURIN"},{lat:40.6401,lng:15.8057,nombre:"POTENZA"},
      {lat:38.1157,lng:13.3615,nombre:"PALERMO"},{lat:37.5079,lng:15.083,nombre:"CATANIA"},
      {lat:37.9364,lng:23.9444,nombre:"PIRAEUS"},{lat:40.6401,lng:22.9444,nombre:"THESSALONIKI"},
      {lat:35.3387,lng:25.1442,nombre:"HERAKLION"},{lat:38.2466,lng:21.7346,nombre:"PATRAS"},
      // Europa del Norte
      {lat:59.3293,lng:18.0686,nombre:"STOCKHOLM"},{lat:60.1699,lng:24.9384,nombre:"HELSINKI"},
      {lat:55.6761,lng:12.5683,nombre:"COPENHAGEN"},{lat:59.9139,lng:10.7522,nombre:"OSLO"},
      {lat:57.7089,lng:11.9746,nombre:"GOTHENBURG"},{lat:55.6050,lng:13.0038,nombre:"MALMÖ"},
      {lat:60.3929,lng:5.3241,nombre:"BERGEN"},{lat:63.4305,lng:10.3951,nombre:"TRONDHEIM"},
      {lat:64.1355,lng:-21.8954,nombre:"REYKJAVIK"},{lat:56.9496,lng:24.1052,nombre:"RIGA"},
      {lat:59.437,lng:24.7536,nombre:"TALLINN"},{lat:54.6872,lng:25.2797,nombre:"VILNIUS"},
      // Europa del Este
      {lat:50.0755,lng:14.4378,nombre:"PRAGUE"},{lat:52.2297,lng:21.0122,nombre:"WARSAW"},
      {lat:47.4979,lng:19.0402,nombre:"BUDAPEST"},{lat:44.8176,lng:20.4633,nombre:"BELGRADE"},
      {lat:44.4268,lng:26.1025,nombre:"BUCHAREST"},{lat:42.6977,lng:23.3219,nombre:"SOFIA"},
      {lat:46.0569,lng:14.5058,nombre:"LJUBLJANA"},{lat:45.813,lng:15.9775,nombre:"ZAGREB"},
      {lat:43.8563,lng:18.4131,nombre:"SARAJEVO"},{lat:42.0,lng:21.4333,nombre:"SKOPJE"},
      {lat:42.4411,lng:19.2636,nombre:"PODGORICA"},{lat:41.3275,lng:19.8187,nombre:"TIRANA"},
      {lat:55.7558,lng:37.6173,nombre:"MOSCOW"},{lat:59.9343,lng:30.3351,nombre:"ST. PETERSBURG"},
      {lat:50.4501,lng:30.5234,nombre:"KYIV"},{lat:53.9045,lng:27.5615,nombre:"MINSK"},
      {lat:56.8389,lng:60.6057,nombre:"EKATERINBURG"},{lat:55.0084,lng:82.9357,nombre:"NOVOSIBIRSK"},
      {lat:53.2001,lng:50.15,nombre:"SAMARA"},{lat:56.3269,lng:44.0059,nombre:"NIZHNY NOVGOROD"},
      {lat:47.2357,lng:39.7015,nombre:"ROSTOV-ON-DON"},{lat:54.7388,lng:55.9721,nombre:"UFA"},
      {lat:43.9,lng:132.68,nombre:"VLADIVOSTOK"},{lat:51.1801,lng:71.446,nombre:"ASTANA"},
      {lat:48.4647,lng:135.0599,nombre:"KHABAROVSK"},{lat:57.1,lng:65.5333,nombre:"TYUMEN"},
      // África
      {lat:30.0444,lng:31.2357,nombre:"CAIRO"},{lat:-26.2041,lng:28.0473,nombre:"JOHANNESBURG"},
      {lat:-33.9249,lng:18.4241,nombre:"CAPE TOWN"},{lat:6.5244,lng:3.3792,nombre:"LAGOS"},
      {lat:5.56,lng:-0.1969,nombre:"ACCRA"},{lat:14.6937,lng:-17.4441,nombre:"DAKAR"},
      {lat:33.9716,lng:-6.8498,nombre:"RABAT"},{lat:36.8065,lng:10.1815,nombre:"TUNIS"},
      {lat:32.8872,lng:13.1913,nombre:"TRIPOLI"},{lat:15.5007,lng:32.5599,nombre:"KHARTOUM"},
      {lat:-1.9441,lng:30.0619,nombre:"KIGALI"},{lat:-4.3317,lng:15.3278,nombre:"KINSHASA"},
      {lat:-25.9692,lng:32.5732,nombre:"MAPUTO"},{lat:-18.9137,lng:47.5361,nombre:"ANTANANARIVO"},
      {lat:-29.3,lng:27.4833,nombre:"MASERU"},{lat:-26.3167,lng:31.1333,nombre:"MBABANE"},
      {lat:9.0579,lng:7.4951,nombre:"ABUJA"},{lat:4.0511,lng:9.7679,nombre:"DOUALA"},
      {lat:3.848,lng:11.5021,nombre:"YAOUNDÉ"},{lat:12.3647,lng:-1.5354,nombre:"OUAGADOUGOU"},
      {lat:13.5137,lng:2.1098,nombre:"NIAMEY"},{lat:12.6392,lng:8.0,nombre:"KANO"},
      {lat:6.3703,lng:2.3912,nombre:"COTONOU"},{lat:6.1375,lng:1.2123,nombre:"LOMÉ"},
      {lat:13.5115,lng:-2.1098,nombre:"BAMAKO"},{lat:9.5093,lng:-13.7122,nombre:"CONAKRY"},
      {lat:8.4897,lng:-13.2344,nombre:"FREETOWN"},{lat:6.3004,lng:-10.7969,nombre:"MONROVIA"},
      {lat:5.3484,lng:-4.0067,nombre:"ABIDJAN"},{lat:11.5886,lng:43.145,nombre:"DJIBOUTI"},
      {lat:2.0469,lng:45.3418,nombre:"MOGADISHU"},{lat:-2.5167,lng:32.9,nombre:"MWANZA"},
      {lat:-6.1731,lng:35.7394,nombre:"DODOMA"},{lat:-6.7924,lng:39.2083,nombre:"DAR ES SALAAM"},
      {lat:-13.9626,lng:33.7741,nombre:"LILONGWE"},{lat:-15.4167,lng:28.2833,nombre:"LUSAKA"},
      {lat:-17.8252,lng:31.0335,nombre:"HARARE"},{lat:-22.5597,lng:17.0832,nombre:"WINDHOEK"},
      {lat:-24.6282,lng:25.9231,nombre:"GABORONE"},{lat:15.3569,lng:38.9183,nombre:"ASMARA"},
      {lat:9.0248,lng:38.7469,nombre:"ADDIS ABABA"},{lat:0.3163,lng:32.5822,nombre:"KAMPALA"},
      {lat:-4.0435,lng:39.6682,nombre:"MOMBASA"},{lat:-1.2921,lng:36.8219,nombre:"NAIROBI"},
      {lat:33.5731,lng:-7.5898,nombre:"CASABLANCA"},{lat:34.0209,lng:-5.0,nombre:"FÈS"},
      {lat:31.6295,lng:-7.9811,nombre:"MARRAKECH"},{lat:36.7372,lng:3.0865,nombre:"ALGIERS"},
      {lat:36.9,lng:7.7667,nombre:"ANNABA"},{lat:35.6971,lng:0.6308,nombre:"ORAN"},
      {lat:3.864,lng:11.5167,nombre:"BERTOUA"},{lat:7.3697,lng:13.8536,nombre:"NGAOUNDÉRÉ"},
      // Asia Oriental
      {lat:39.9042,lng:116.4074,nombre:"BEIJING"},{lat:31.2304,lng:121.4737,nombre:"SHANGHAI"},
      {lat:35.6762,lng:139.6503,nombre:"TOKYO"},{lat:37.5665,lng:126.978,nombre:"SEOUL"},
      {lat:22.3193,lng:114.1694,nombre:"HONG KONG"},{lat:25.0330,lng:121.5654,nombre:"TAIPEI"},
      {lat:34.6937,lng:135.5022,nombre:"OSAKA"},{lat:43.0618,lng:141.3545,nombre:"SAPPORO"},
      {lat:33.5904,lng:130.4017,nombre:"FUKUOKA"},{lat:35.1815,lng:136.906,nombre:"NAGOYA"},
      {lat:35.0116,lng:135.768,nombre:"KYOTO"},{lat:31.5,lng:120.3,nombre:"SUZHOU"},
      {lat:30.5728,lng:104.0668,nombre:"CHENGDU"},{lat:29.5637,lng:106.5504,nombre:"CHONGQING"},
      {lat:28.2,lng:112.9333,nombre:"CHANGSHA"},{lat:30.2741,lng:120.1551,nombre:"HANGZHOU"},
      {lat:32.0603,lng:118.7969,nombre:"NANJING"},{lat:36.0671,lng:120.3826,nombre:"QINGDAO"},
      {lat:23.1291,lng:113.2644,nombre:"GUANGZHOU"},{lat:22.5431,lng:114.0579,nombre:"SHENZHEN"},
      {lat:26.0745,lng:119.2965,nombre:"FUZHOU"},{lat:24.4797,lng:118.0819,nombre:"XIAMEN"},
      {lat:25.0,lng:102.7,nombre:"KUNMING"},{lat:36.6166,lng:101.7786,nombre:"XINING"},
      {lat:38.0428,lng:114.5149,nombre:"SHIJIAZHUANG"},{lat:34.7472,lng:113.6249,nombre:"ZHENGZHOU"},
      {lat:36.0667,lng:103.8333,nombre:"LANZHOU"},{lat:43.8256,lng:87.6168,nombre:"URUMQI"},
      {lat:29.65,lng:91.1,nombre:"LHASA"},{lat:37.3333,lng:121.3833,nombre:"YANTAI"},
      {lat:39.1336,lng:117.2054,nombre:"TIANJIN"},{lat:41.7922,lng:123.4328,nombre:"SHENYANG"},
      {lat:43.9006,lng:125.3222,nombre:"CHANGCHUN"},{lat:45.7576,lng:126.6409,nombre:"HARBIN"},
      {lat:35.1044,lng:129.0349,nombre:"BUSAN"},{lat:35.8714,lng:128.6014,nombre:"DAEGU"},
      {lat:37.4563,lng:126.7052,nombre:"INCHEON"},{lat:35.5384,lng:129.3114,nombre:"ULSAN"},
      {lat:36.3504,lng:127.3845,nombre:"DAEJEON"},{lat:35.1595,lng:126.8526,nombre:"GWANGJU"},
      {lat:37.2636,lng:127.0286,nombre:"SUWON"},{lat:33.4996,lng:126.5312,nombre:"JEJU"},
      // Asia del Sur
      {lat:28.6139,lng:77.209,nombre:"NEW DELHI"},{lat:19.076,lng:72.8777,nombre:"MUMBAI"},
      {lat:22.5726,lng:88.3639,nombre:"KOLKATA"},{lat:13.0827,lng:80.2707,nombre:"CHENNAI"},
      {lat:12.9716,lng:77.5946,nombre:"BANGALORE"},{lat:17.385,lng:78.4867,nombre:"HYDERABAD"},
      {lat:23.0225,lng:72.5714,nombre:"AHMEDABAD"},{lat:18.5204,lng:73.8567,nombre:"PUNE"},
      {lat:26.8467,lng:80.9462,nombre:"LUCKNOW"},{lat:22.8046,lng:86.2029,nombre:"JAMSHEDPUR"},
      {lat:21.1458,lng:79.0882,nombre:"NAGPUR"},{lat:13.3409,lng:74.7421,nombre:"MANGALORE"},
      {lat:9.9312,lng:76.2673,nombre:"KOCHI"},{lat:11.0168,lng:76.9558,nombre:"COIMBATORE"},
      {lat:26.4499,lng:74.6399,nombre:"AJMER"},{lat:23.1765,lng:75.7885,nombre:"UJJAIN"},
      {lat:25.3176,lng:82.9739,nombre:"VARANASI"},{lat:24.5854,lng:73.7125,nombre:"UDAIPUR"},
      {lat:27.0238,lng:74.2179,nombre:"AJMER"},{lat:15.8497,lng:74.4977,nombre:"BELGAUM"},
      {lat:33.72,lng:73.04,nombre:"ISLAMABAD"},{lat:24.8607,lng:67.0011,nombre:"KARACHI"},
      {lat:31.5497,lng:74.3436,nombre:"LAHORE"},{lat:34.0151,lng:71.5249,nombre:"PESHAWAR"},
      {lat:30.1798,lng:66.975,nombre:"QUETTA"},{lat:25.3960,lng:68.3578,nombre:"HYDERABAD (PK)"},
      {lat:23.8103,lng:90.4125,nombre:"DHAKA"},{lat:22.3569,lng:91.7832,nombre:"CHITTAGONG"},
      {lat:27.4716,lng:89.639,nombre:"THIMPHU"},{lat:27.7172,lng:85.3240,nombre:"KATHMANDU"},
      {lat:6.9271,lng:79.8612,nombre:"COLOMBO"},{lat:7.2906,lng:80.6337,nombre:"KANDY"},
      {lat:4.1755,lng:73.5093,nombre:"MALÉ"},{lat:11.7401,lng:92.7382,nombre:"PORT BLAIR"},
      // Asia del Sudeste
      {lat:1.3521,lng:103.8198,nombre:"SINGAPORE"},{lat:3.139,lng:101.6869,nombre:"KUALA LUMPUR"},
      {lat:13.7563,lng:100.5018,nombre:"BANGKOK"},{lat:10.8231,lng:106.6297,nombre:"HO CHI MINH"},
      {lat:21.0278,lng:105.8342,nombre:"HANOI"},{lat:14.5995,lng:120.9842,nombre:"MANILA"},
      {lat:-6.2088,lng:106.8456,nombre:"JAKARTA"},{lat:16.0544,lng:108.2022,nombre:"DA NANG"},
      {lat:16.4637,lng:102.8336,nombre:"KHON KAEN"},{lat:18.7961,lng:98.9997,nombre:"CHIANG MAI"},
      {lat:7.8731,lng:98.3925,nombre:"PHUKET"},{lat:11.5625,lng:104.916,nombre:"PHNOM PENH"},
      {lat:17.9666,lng:102.6,nombre:"VIENTIANE"},{lat:19.9,lng:102.1333,nombre:"LUANG PRABANG"},
      {lat:16.8661,lng:96.1951,nombre:"YANGON"},{lat:21.9162,lng:96.0891,nombre:"MANDALAY"},
      {lat:5.8456,lng:95.3217,nombre:"BANDA ACEH"},{lat:3.5952,lng:98.6722,nombre:"MEDAN"},
      {lat:-7.2575,lng:112.7521,nombre:"SURABAYA"},{lat:-6.9175,lng:107.6191,nombre:"BANDUNG"},
      {lat:-8.6705,lng:115.2126,nombre:"DENPASAR"},{lat:-8.5069,lng:140.2918,nombre:"MERAUKE"},
      {lat:0.9203,lng:122.6073,nombre:"GORONTALO"},{lat:-3.3194,lng:114.5908,nombre:"BANJARMASIN"},
      {lat:1.4748,lng:124.8421,nombre:"MANADO"},{lat:-5.1477,lng:119.4327,nombre:"MAKASSAR"},
      {lat:10.3157,lng:123.8854,nombre:"CEBU"},{lat:8.4822,lng:124.6472,nombre:"CAGAYAN DE ORO"},
      {lat:7.191,lng:125.4553,nombre:"DAVAO"},{lat:4.1428,lng:108.4498,nombre:"MIRI"},
      {lat:5.9788,lng:116.0735,nombre:"KOTA KINABALU"},{lat:1.5496,lng:110.3626,nombre:"KUCHING"},
      {lat:4.9031,lng:114.9398,nombre:"BANDAR SERI BEGAWAN"},{lat:13.0825,lng:121.5,nombre:"BATANGAS"},
      // Asia Central y Medio Oriente
      {lat:25.2048,lng:55.2708,nombre:"DUBAI"},{lat:24.6877,lng:46.7219,nombre:"RIYADH"},
      {lat:33.3152,lng:44.3661,nombre:"BAGHDAD"},{lat:35.6892,lng:51.389,nombre:"TEHRAN"},
      {lat:33.8869,lng:35.5131,nombre:"BEIRUT"},{lat:31.7683,lng:35.2137,nombre:"JERUSALEM"},
      {lat:41.2995,lng:69.2401,nombre:"TASHKENT"},{lat:43.222,lng:76.8512,nombre:"ALMATY"},
      {lat:37.9601,lng:58.3261,nombre:"ASHGABAT"},{lat:38.5598,lng:68.7733,nombre:"DUSHANBE"},
      {lat:42.8711,lng:74.5978,nombre:"BISHKEK"},{lat:49.8,lng:73.1,nombre:"KARAGANDA"},
      {lat:23.5880,lng:58.3829,nombre:"MUSCAT"},{lat:26.2235,lng:50.5876,nombre:"MANAMA"},
      {lat:29.3759,lng:47.9774,nombre:"KUWAIT CITY"},{lat:25.2854,lng:51.531,nombre:"DOHA"},
      {lat:24.4539,lng:54.3773,nombre:"ABU DHABI"},{lat:24.2,lng:55.7333,nombre:"AL AIN"},
      {lat:22.2,lng:59.2,nombre:"SALALAH"},{lat:15.3694,lng:44.191,nombre:"SANAA"},
      {lat:12.78,lng:45.02,nombre:"ADÉN"},{lat:36.2021,lng:37.1343,nombre:"ALEPPO"},
      {lat:33.5102,lng:36.2913,nombre:"DAMASCO"},{lat:32.5568,lng:35.8469,nombre:"IRBID"},
      {lat:31.9522,lng:35.9284,nombre:"AMMAN"},{lat:29.2,lng:47.9667,nombre:"AHMADI"},
      {lat:21.3891,lng:39.8579,nombre:"JEDDAH"},{lat:24.7,lng:46.7,nombre:"RIYAD"},
      {lat:21.4667,lng:39.6167,nombre:"MECA"},{lat:24.4686,lng:39.6142,nombre:"MEDINA"},
      // Oceanía
      {lat:-33.8688,lng:151.2093,nombre:"SYDNEY"},{lat:-37.8136,lng:144.9631,nombre:"MELBOURNE"},
      {lat:-27.4698,lng:153.0251,nombre:"BRISBANE"},{lat:-31.9505,lng:115.8605,nombre:"PERTH"},
      {lat:-34.9285,lng:138.6007,nombre:"ADELAIDE"},{lat:-12.4634,lng:130.8456,nombre:"DARWIN"},
      {lat:-42.8821,lng:147.3272,nombre:"HOBART"},{lat:-35.2809,lng:149.13,nombre:"CANBERRA"},
      {lat:-36.8485,lng:174.7633,nombre:"AUCKLAND"},{lat:-41.2865,lng:174.7762,nombre:"WELLINGTON"},
      {lat:-43.532,lng:172.6306,nombre:"CHRISTCHURCH"},{lat:-45.8788,lng:170.5028,nombre:"DUNEDIN"},
      {lat:-17.7334,lng:168.3219,nombre:"PORT VILA"},{lat:-9.4438,lng:160.0251,nombre:"HONIARA"},
      {lat:-18.1416,lng:178.4419,nombre:"SUVA"},{lat:-8.5211,lng:179.1962,nombre:"FUNAFUTI"},
      {lat:7.3697,lng:134.4706,nombre:"NGERULMUD"},{lat:13.5006,lng:144.7996,nombre:"HAGÅTÑA"},
      {lat:-21.1344,lng:-175.2018,nombre:"NUKU'ALOFA"},{lat:-13.8314,lng:-171.7674,nombre:"APIA"},
      {lat:-17.5334,lng:-149.5667,nombre:"PAPEETE"},{lat:-22.2711,lng:166.4385,nombre:"NOUMÉA"},
    ];

    const globe = Globe({ animateIn: true })(globeRef.current)
      .globeImageUrl("https://unpkg.com/three-globe/example/img/earth-night.jpg")
      .backgroundImageUrl("https://unpkg.com/three-globe/example/img/night-sky.png")
      .showAtmosphere(true)
      .atmosphereColor("#1a6aff")
      .atmosphereAltitude(0.18)
      .pointsData([])
      .pointColor(p => p.color || "#2DD4E8")
      .pointAltitude(0.02)
      .pointRadius(p => p.r || 0.5)
      .pointLabel(p => `<div style="background:rgba(6,11,18,0.92);border:1px solid ${p.color||"#2DD4E8"};border-radius:3px;padding:4px 10px;font-family:JetBrains Mono,monospace;font-size:10px;color:${p.color||"#2DD4E8"}">${p.label}</div>`)
      .arcsData([])
      .arcColor(a => [a.color, a.color])
      .arcAltitude(0.2)
      .arcStroke(1.5)
      .arcDashLength(0.4)
      .arcDashGap(0.15)
      .arcDashAnimateTime(2000)
      .labelsData(CIUDADES)
      .labelText(d => d.nombre)
      .labelSize(0.4)
      .labelDotRadius(0.25)
      .labelColor(() => "#ffffff")
      .labelDotOrientation(() => "bottom")
      .labelResolution(3)
      .labelAltitude(0.01)
      .labelLabel(d => `<div style="background:rgba(6,11,18,0.85);border:1px solid rgba(255,255,255,0.2);border-radius:2px;padding:2px 6px;font-family:JetBrains Mono,monospace;font-size:9px;color:#ffffff">${d.nombre}</div>`);

    globe.controls().autoRotate = true;
    globe.controls().autoRotateSpeed = 0.4;

    // Al hacer clic en un punto, ir a vista de calles
    globe.onPointClick(p => {
      if (p.dest) verCalles(p.dest);
    });

    // Aplicar filtro cian HUD sobre el canvas de WebGL
    const canvas = globeRef.current.querySelector("canvas");
    if (canvas) {
      canvas.style.filter = "saturate(0) brightness(1.3) sepia(1) hue-rotate(175deg) saturate(4) brightness(0.75)";
    }

    globeInst.current = globe;
    setCargando(false);
    obtenerUbicacion(globe);
    // Si hay búsqueda pendiente de voz, ejecutarla
    if (busquedaInicial && !busquedaEjecutadaRef.current) {
      busquedaEjecutadaRef.current = true;
      setTimeout(() => {
        setQuery(busquedaInicial);
        buscarPorTermino(busquedaInicial);
      }, 1500);
    }
  };

  const obtenerUbicacion = (globe) => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(pos => {
      const { latitude: lat, longitude: lon } = pos.coords;
      setMiPos({ lat, lon });
      globe.pointOfView({ lat, lng: lon, altitude: 1.8 }, 1500);
      // Geolocalización inversa para mostrar ciudad más cercana
      fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=es`)
        .then(r => r.json())
        .then(data => {
          const ciudad = data.address?.city || data.address?.town || data.address?.village || "Mi posición";
          const label = `📍 ${ciudad.toUpperCase()}`;
          globe.pointsData([{ lat, lng: lon, color: "#4ADE80", label, r: 0.5 }]);
        })
        .catch(() => {
          globe.pointsData([{ lat, lng: lon, color: "#4ADE80", label: "📍 MI POSICIÓN", r: 0.5 }]);
        });
      if (globeInst.current) globeInst.current.controls().autoRotate = false;
    }, () => {});
  };

  // ── Cargar Leaflet para vista de calles ───────────────────────────────
  const cargarLeaflet = useCallback((lat, lon, marcadores = []) => {
    const cargar = () => {
      if (!mapRef.current) return;
      const L = window.L;

      if (leafletRef.current) {
        leafletRef.current.setView([lat, lon], 16);
        // Actualizar marcadores
        marcRef.current.forEach(m => leafletRef.current.removeLayer(m));
        marcRef.current = [];
        agregarMarcadores(L, leafletRef.current, marcadores, lat, lon);
        return;
      }

      const map = L.map(mapRef.current, {
        center: [lat, lon], zoom: 16,
        zoomControl: false, attributionControl: false,
      });
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        maxZoom: 19, subdomains: "abcd",
      }).addTo(map);

      leafletRef.current = map;
      agregarMarcadores(L, map, marcadores, lat, lon);
      // Forzar recálculo de tamaño múltiples veces
      setTimeout(() => map.invalidateSize(true), 100);
      setTimeout(() => map.invalidateSize(true), 300);
      setTimeout(() => map.invalidateSize(true), 600);
      // Observer para cuando el contenedor cambia de tamaño
      if (window.ResizeObserver && mapRef.current) {
        new ResizeObserver(() => map.invalidateSize(true)).observe(mapRef.current);
      }
    };

    if (window.L) { cargar(); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    s.onload = cargar;
    document.head.appendChild(s);
    const l = document.createElement("link");
    l.rel  = "stylesheet";
    l.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
    document.head.appendChild(l);
  }, []);

  const agregarMarcadores = (L, map, marcadores, latDest, lonDest) => {
    // Mi posición
    if (miPos) {
      const iconMi = L.divIcon({
        html: `<div class="sm-mi-wrap"><div class="sm-mi-ring"></div><div class="sm-mi-dot"></div></div>`,
        className: "", iconSize: [20,20], iconAnchor: [10,10],
      });
      const m = L.marker([miPos.lat, miPos.lon], { icon: iconMi }).addTo(map);
      miUbicRef.current = m;
      marcRef.current.push(m);
    }
    // Marcadores de resultados
    marcadores.forEach((r, i) => {
      const icon = L.divIcon({
        html: `<div class="sm-marker"><div class="sm-marker-num" style="background:${r.color};color:#060B12">${i+1}</div><div class="sm-marker-label">${r.nombre.slice(0,20)}</div></div>`,
        className: "", iconSize: [20,20], iconAnchor: [10,30],
      });
      const m = L.marker([r.lat, r.lon], { icon }).addTo(map);
      marcRef.current.push(m);
    });
  };

  // ── Ver calles de un lugar ────────────────────────────────────────────
  const verCalles = useCallback((dest) => {
    // Destruir Leaflet anterior para evitar conflictos de tamaño
    if (leafletRef.current) {
      leafletRef.current.remove();
      leafletRef.current = null;
      marcRef.current = [];
      rutasRef.current = [];
    }
    setRutas([]);
    setModo("calles");
    setDestActual(dest);
    setTimeout(() => cargarLeaflet(dest.lat, dest.lon, resultados), 150);
  }, [resultados, cargarLeaflet]);

  const volverGlobo = () => {
    // Destruir Leaflet para que se recree limpio la próxima vez
    if (leafletRef.current) {
      leafletRef.current.remove();
      leafletRef.current = null;
      marcRef.current = [];
      rutasRef.current = [];
    }
    setModo("globo");
    setRutas([]);
    setDestActual(null);
  };

  // ── Buscar ────────────────────────────────────────────────────────────
  const buscarPorTermino = useCallback(async (termino) => {
    if (!termino?.trim()) return;
    setQuery(termino);
    setBuscando(true); setError(null); setResultados([]);
    try {
      const r = await fetch(
        `${NOMINATIM}/search?q=${encodeURIComponent(termino)}&format=json&limit=5&addressdetails=1`,
        { headers: { "Accept-Language": "es" } }
      );
      const data = await r.json();
      if (!data.length) { setError("Sin resultados."); setBuscando(false); return; }
      const res = data.map((r, i) => ({
        nombre: r.display_name.split(",")[0],
        dir:    r.display_name,
        lat:    parseFloat(r.lat),
        lon:    parseFloat(r.lon),
        color:  COLORES[i],
      }));
      setResultados(res);
      const miPunto = miPos ? [{ lat: miPos.lat, lng: miPos.lon, color: "#4ADE80", label: "📍 Mi posición", size: 0.5 }] : [];
      const puntos = res.map((r, i) => ({ lat: r.lat, lng: r.lon, color: r.color, label: `${i+1}. ${r.nombre}`, dest: r }));
      if (globeInst.current) {
        globeInst.current.pointsData([...miPunto, ...puntos]);
        globeInst.current.pointOfView({ lat: res[0].lat, lng: res[0].lon, altitude: 2.0 }, 1500);
        globeInst.current.controls().autoRotate = false;
      }
    } catch { setError("Error de conexión."); }
    setBuscando(false);
  }, [miPos]);

  const buscar = useCallback(async () => {
    await buscarPorTermino(query);
  }, [query, buscarPorTermino]);

  // ── Calcular ruta en vista calles ─────────────────────────────────────
  const calcularRuta = useCallback(async (dest) => {
    if (!miPos) { setError("Activa el GPS primero."); return; }
    // Si estamos en modo globo, cambiar a calles primero
    if (modo === "globo") {
      setModo("calles");
      setDestActual(dest);
      await new Promise(r => setTimeout(r, 150));
      await new Promise(r => {
        const esperar = setInterval(() => {
          if (mapRef.current) { clearInterval(esperar); r(); }
        }, 50);
      });
      if (!leafletRef.current) await new Promise(r => setTimeout(r, 300));
    }
    if (!leafletRef.current) { setError("El mapa no está listo."); return; }
    // Asegurar que Leaflet recalcula su tamaño
    setTimeout(() => leafletRef.current?.invalidateSize(), 100);
    rutasRef.current.forEach(r => leafletRef.current.removeLayer(r));
    rutasRef.current = [];
    setRutas([]);
    const L = window.L;
    try {
      const r = await fetch(`${OSRM}/${miPos.lon},${miPos.lat};${dest.lon},${dest.lat}?alternatives=true&overview=full&geometries=geojson`);
      const data = await r.json();
      if (!data.routes?.length) { setError("Sin ruta."); return; }

      const nuevas = data.routes.map((rt, i) => ({
        idx: i, km: (rt.distance/1000).toFixed(1),
        min: Math.round(rt.duration/60), color: COLORES[i], activa: i===0,
      }));
      setRutas(nuevas);

      data.routes.forEach((rt, i) => {
        const linea = L.geoJSON(rt.geometry, {
          style: { color: COLORES[i], weight: i===0?5:2.5, opacity: i===0?0.9:0.5, dashArray: i===0?null:"8 5" }
        }).addTo(leafletRef.current);
        rutasRef.current.push(linea);
      });
      leafletRef.current.fitBounds(rutasRef.current[0].getBounds(), { padding:[40,40] });
    } catch { setError("Error calculando ruta."); }
  }, [miPos]);

  const seleccionarRuta = (idx) => {
    rutasRef.current.forEach((l, i) => l.setStyle({
      weight: i===idx?5:2.5, opacity: i===idx?0.9:0.4,
      dashArray: i===idx?null:"8 5",
    }));
    setRutas(prev => prev.map(r => ({ ...r, activa: r.idx===idx })));
  };

  const guardar = (r) => setGuardados(prev => prev.find(g => g.lat===r.lat) ? prev : [...prev, r]);
  const handleKey = (e) => { if (e.key === "Enter") buscar(); };

  return (
    <div className="sm-shell">
      <div className="sm-gbg"/>
      <div className="sm-cn sm-tl"/><div className="sm-cn sm-tr"/>
      <div className="sm-cn sm-bl"/><div className="sm-cn sm-br"/>

      <header className="sm-hdr">
        <button className="sm-back" onClick={onVolver}>← VOLVER</button>
        <div className="sm-brand">
          <span className="sm-btag">STARK MAPS</span>
          <span className="sm-bname">{modo === "globo" ? "GLOBO INTERACTIVO 3D" : "VISTA DE CALLES"}</span>
        </div>
        {miPos && <span className="sm-coords">{miPos.lat.toFixed(4)}° · {miPos.lon.toFixed(4)}°</span>}
        <div className="sm-live"><div className="sm-ld"/>GPS ACTIVO</div>
      </header>

      <div className="sm-body">
        {/* Panel flotante sobre el globo */}
        <div className="sm-float-panel">
          <div className="sm-panel">
            <div className="sm-ph">◎ BÚSQUEDA <div className="sm-pd"/></div>
            <div className="sm-search-box">
              <input className="sm-search-input" placeholder="Buscar lugar…"
                value={query} onChange={e => setQuery(e.target.value)} onKeyDown={handleKey}/>
              <button className="sm-search-btn" onClick={buscar} disabled={buscando || cargando}>
                {buscando ? "…" : "▶"}
              </button>
            </div>
            <div className="sm-btns-row">
              {modo === "calles" && (
                <button className="sm-mbtn sm-mbtn-cyan" onClick={volverGlobo}>◈ GLOBO</button>
              )}
              <button className="sm-mbtn" onClick={() => {
                if (globeInst.current) {
                  globeInst.current.controls().autoRotate = !globeInst.current.controls().autoRotate;
                }
              }}>↺ ROTAR</button>
              <button className="sm-mbtn" onClick={() => {
                if (miPos && globeInst.current) {
                  globeInst.current.pointOfView({ lat: miPos.lat, lng: miPos.lon, altitude: 1.5 }, 1200);
                  if (modo === "calles") leafletRef.current?.setView([miPos.lat, miPos.lon], 15);
                }
              }}>⌖ MI POS</button>
            </div>
            {error && <div className="sm-error">⚠ {error}</div>}

            {resultados.length > 0 && (
              <div className="sm-resultados">
                <div className="sm-res-header">
                  {modo === "globo" ? "↓ Clic en punto o en resultado para ver calles" : `RESULTADOS (${resultados.length})`}
                </div>
                {resultados.map((r, i) => (
                  <div key={i} className="sm-res-row">
                    <div className="sm-res-num" style={{background:r.color,color:"#060B12"}}>{i+1}</div>
                    <div className="sm-res-body" onClick={() => verCalles(r)} style={{cursor:"pointer"}}>
                      <div className="sm-res-nombre">{r.nombre}</div>
                      <div className="sm-res-dir">{r.dir.slice(0,40)}…</div>
                    </div>
                    <div className="sm-res-btns">
                      <button className="sm-rbtn-mini sm-rbtn-map" onClick={() => verCalles(r)}>🗺</button>
                      {modo === "calles" && (
                        <button className="sm-rbtn-mini sm-rbtn-cyan" onClick={() => calcularRuta(r)}>RUTA</button>
                      )}
                      <button className="sm-rbtn-mini sm-rbtn-dim" onClick={() => guardar(r)}>✎</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {rutas.length > 0 && (
            <div className="sm-panel">
              <div className="sm-ph">◈ RUTAS ({rutas.length}) <div className="sm-pd"/></div>
              {rutas.map(r => (
                <div key={r.idx} className={`sm-ruta-row ${r.activa?"sm-ruta-activa":""}`} onClick={() => seleccionarRuta(r.idx)}>
                  <div className="sm-ruta-color" style={{background:r.color}}/>
                  <div className="sm-ruta-body">
                    <span className="sm-ruta-label">RUTA {r.idx+1}{r.activa?" · ACTIVA":""}</span>
                    <span className="sm-ruta-vals">
                      <span style={{color:r.color}}>{r.km} km</span>
                      <span className="sm-ruta-sep">·</span>
                      <span>{r.min} min</span>
                    </span>
                  </div>
                  {r.activa && <span className="sm-ruta-check">✓</span>}
                </div>
              ))}
            </div>
          )}

          {guardados.length > 0 && (
            <div className="sm-panel sm-panel-flex">
              <div className="sm-ph">⬡ GUARDADOS ({guardados.length}) <div className="sm-pd"/></div>
              <div className="sm-mlist">
                {guardados.map((g, i) => (
                  <div key={i} className="sm-mrow" onClick={() => { verCalles(g); calcularRuta(g); }}>
                    <div className="sm-micon" style={{background:`${g.color}22`,color:g.color,border:`1px solid ${g.color}55`}}>◈</div>
                    <div className="sm-mbody">
                      <div className="sm-mname">{g.nombre}</div>
                      <div className="sm-maddr">{g.lat.toFixed(4)}° · {g.lon.toFixed(4)}°</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="sm-panel" style={{flexShrink:0}}>
            <div className="sm-ph">▸ CONTROLES <div className="sm-pd"/></div>
            <div className="sm-hint-list">
              {modo === "globo" ? <>
                <div className="sm-hint">🌍 Arrastra para rotar el globo</div>
                <div className="sm-hint">🔍 Scroll para zoom</div>
                <div className="sm-hint">📍 Clic en punto → ver calles</div>
                <div className="sm-hint">🗺 Clic en resultado → ver calles</div>
              </> : <>
                <div className="sm-hint">🗺 Mapa real con calles OSM</div>
                <div className="sm-hint">◈ RUTA para calcular ruta</div>
                <div className="sm-hint">◈ GLOBO para volver al 3D</div>
              </>}
            </div>
          </div>
        </div>

        {/* Globo/mapa ocupa todo el espacio restante */}
        <div className="sm-map-container">
          {/* Globo 3D */}
          <div className={`sm-globe-wrap ${modo === "calles" ? "sm-view-mini" : "sm-view-full"}`}>
            {cargando && (
              <div className="sm-loading">
                <div className="sm-spin"/>
                <span>Cargando globo 3D…</span>
              </div>
            )}
            <div ref={globeRef} className="sm-globe"/>
            <div className="sm-hud-tl">
            </div>
            {modo === "calles" && (
              <button className="sm-expand-btn" onClick={volverGlobo}>⛶ EXPANDIR</button>
            )}
          </div>

          {/* Vista de calles */}
          {modo === "calles" && (
            <div className="sm-street-wrap">
              <div ref={mapRef} className="sm-map"/>
              <div className="sm-hud-tl">
                <div className="sm-hbadge sm-hbadge-cyan">VISTA CALLES</div>
                {destActual && <div className="sm-hbadge">{destActual.nombre.slice(0,20)}</div>}
                {rutas.length > 0 && <div className="sm-hbadge sm-hbadge-amber">{rutas.length} RUTAS</div>}
              </div>
              <div className="sm-zoom-ctrl">
                <button className="sm-zbtn" onClick={() => leafletRef.current?.zoomIn()}>+</button>
                <button className="sm-zbtn" onClick={() => leafletRef.current?.zoomOut()}>−</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}