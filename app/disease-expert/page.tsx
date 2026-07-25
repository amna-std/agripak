// DISABLED (out of scope for v1) — see AGENT_CONTRACT.md rule 7.
//
// Why: this screen was a second, older crop-disease UI. It duplicates
// /crop-scan, which is now the single photo-diagnosis flow wired to
// POST /api/ai/diagnose. Keeping two of them meant two places to keep
// correct and two answers for the same photo.
//
// It also could not be made honest as a "history" page: /api/ai/diagnose
// persists a CropDiagnosis for signed-in farmers but there is no GET route to
// read those back, so any list here would have had to be invented — which the
// contract bans.
//
// The file is preserved, not deleted. The whole original implementation is
// kept verbatim at the bottom of this file as line comments (a block comment
// would terminate early on the JSX `*/` sequences), and it is also in git at
// commit ef051b7. Restore by uncommenting and removing the stub below.
//
// The route stays reachable so old bookmarks and links do not 404 — it simply
// explains where the feature went.

"use client"

import Link from "next/link"
import { ArrowRight, ScanLine } from "lucide-react"

import { useLanguage } from "@/lib/contexts"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export default function DiseaseExpertPage() {
  const { t } = useLanguage()

  return (
    <div className="container-app py-10">
      <Card className="rounded-2xl">
        <CardContent className="space-y-4 p-6 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ScanLine className="h-7 w-7" aria-hidden />
          </span>

          <h1 className="text-lg font-bold leading-[1.8] text-foreground">{t("scan.movedTitle")}</h1>
          <p className="text-sm leading-[1.9] text-muted-foreground">{t("scan.movedBody")}</p>

          <Button asChild className="min-h-tap w-full rounded-xl text-base">
            <Link href="/crop-scan">
              <span className="leading-[1.8]">{t("scan.openScanner")}</span>
              <ArrowRight className="ms-2 h-5 w-5 flip-rtl" aria-hidden />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

/* ==========================================================================
   Original implementation, preserved per AGENT_CONTRACT.md rule 7.
   Kept as line comments so the JSX comment markers inside it stay inert.
   ========================================================================== */

// "use client"
//
// import { useState, useRef, useEffect } from "react"
// import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from "@/components/ui/card"
// import { Button } from "@/components/ui/button"
// import { Input } from "@/components/ui/input"
// import { Label } from "@/components/ui/label"
// import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
// import { Badge } from "@/components/ui/badge"
// import { Progress } from "@/components/ui/progress"
// import { Separator } from "@/components/ui/separator"
// import {
//   Upload, Image as ImageIcon, Camera, X, Check, AlertTriangle, Loader2,
//   ArrowLeft, Download, Share2, BookOpen, MapPin, Calendar, Thermometer,
//   Droplets, Wind, Sun, Phone, MessageCircle, Bell, Search, Filter, Star,
//   Heart, Eye, TrendingUp, Clock, Shield, Leaf, Bug, Sprout, CheckCircle2,
//   AlertCircle, ChevronRight, ExternalLink, Info, Plus, Minus, Maximize2,
//   RefreshCw, ChevronDown, ChevronUp, HelpCircle, ShieldCheck, Share,
//   AlertOctagon, CircleCheck, CircleX, CircleAlert, ChevronLeft, ChevronsRight
// } from "lucide-react"
// import Image from "next/image"
// import { diseaseApi } from "@/lib/diseaseApi"
// import { toast } from "sonner"
//
// const translations = {
//   en: {
//     title: "Crop Disease Expert",
//     uploadTitle: "Upload Crop Image",
//     uploadDescription: "Upload an image of your crop to diagnose any diseases or pests.",
//     takePhoto: "Take Photo",
//     uploadFromDevice: "Upload from Device",
//     or: "OR",
//     recentScans: "Recent Scans",
//     noRecentScans: "No recent scans found.",
//     scanNow: "Scan Now",
//     backToDashboard: "Back to Dashboard",
//     analyzing: "Analyzing your image...",
//     results: "Analysis Results",
//     possibleDiseases: "Possible Diseases",
//     treatment: "Recommended Treatment",
//     accuracy: "Confidence",
//     prevention: "Prevention Tips",
//     organic: "Organic",
//     chemical: "Chemical",
//     cultural: "Cultural",
//     similarImages: "Similar Cases",
//     severity: "Severity",
//     low: "Low",
//     medium: "Medium",
//     high: "High",
//     critical: "Critical",
//     weather: "Weather Impact",
//     expert: "Consult Expert",
//     saveReport: "Save Report",
//     shareResults: "Share Results",
//     searchDisease: "Search Disease",
//     filterCrops: "Filter by Crop",
//     emergencyContact: "Emergency Contact",
//     notifications: "Notifications",
//     favourites: "Favourites",
//     trending: "Trending Issues",
//     history: "Scan History",
//     settings: "Settings"
//   },
//   hi: {
//     title: "फसल रोग विशेषज्ञ",
//     uploadTitle: "फसल की तस्वीर अपलोड करें",
//     uploadDescription: "किसी भी बीमारी या कीटों का निदान करने के लिए अपनी फसल की तस्वीर अपलोड करें।",
//     takePhoto: "फोटो लें",
//     uploadFromDevice: "डिवाइस से अपलोड करें",
//     or: "या",
//     recentScans: "हाल की स्कैन",
//     noRecentScans: "कोई हाल की स्कैन नहीं मिली।",
//     scanNow: "अभी स्कैन करें",
//     backToDashboard: "डैशबोर्ड पर वापस",
//     analyzing: "आपकी तस्वीर का विश्लेषण कर रहे हैं...",
//     results: "विश्लेषण परिणाम",
//     possibleDiseases: "संभावित रोग",
//     treatment: "अनुशंसित उपचार",
//     accuracy: "विश्वसनीयता",
//     prevention: "रोकथाम के उपाय",
//     organic: "जैविक",
//     chemical: "रासायनिक",
//     cultural: "सांस्कृतिक",
//     similarImages: "समान मामले",
//     severity: "गंभीरता",
//     low: "कम",
//     medium: "मध्यम",
//     high: "उच्च",
//     critical: "गंभीर",
//     weather: "मौसम प्रभाव",
//     expert: "विशेषज्ञ से सलाह",
//     saveReport: "रिपोर्ट सेव करें",
//     shareResults: "परिणाम साझा करें",
//     searchDisease: "रोग खोजें",
//     filterCrops: "फसल के अनुसार फिल्टर करें",
//     emergencyContact: "आपातकालीन संपर्क",
//     notifications: "सूचनाएं",
//     favourites: "पसंदीदा",
//     trending: "ट्रेंडिंग समस्याएं",
//     history: "स्कैन इतिहास",
//     settings: "सेटिंग्स"
//   }
// }
//
// // Mock data for demonstration
// const mockDiseases = [
//   {
//     id: 1,
//     name: "Late Blight",
//     namePi: "लेट ब्लाइट",
//     crop: "Potato",
//     severity: "high",
//     confidence: 92,
//     description: "A serious fungal disease affecting potato crops",
//     symptoms: ["Dark spots on leaves", "White fungal growth", "Stem rot"],
//     treatments: {
//       organic: ["Copper-based fungicides", "Proper drainage", "Crop rotation"],
//       chemical: ["Metalaxyl", "Chlorothalonil", "Propamocarb"],
//       cultural: ["Remove infected plants", "Improve air circulation", "Avoid overhead watering"]
//     },
//     prevention: ["Use resistant varieties", "Maintain proper spacing", "Monitor weather conditions"],
//     weatherImpact: "High humidity and moderate temperatures (15-20°C) favor disease development",
//     image: "/api/placeholder/200/150"
//   },
//   {
//     id: 2,
//     name: "Aphid Infestation",
//     namePi: "माहू संक्रमण",
//     crop: "Wheat",
//     severity: "medium",
//     confidence: 87,
//     description: "Small insects that suck plant sap",
//     symptoms: ["Curled leaves", "Sticky honeydew", "Yellowing"],
//     treatments: {
//       organic: ["Neem oil", "Ladybug release", "Soap spray"],
//       chemical: ["Imidacloprid", "Thiamethoxam", "Acetamiprid"],
//       cultural: ["Reflective mulch", "Companion planting", "Remove weeds"]
//     },
//     prevention: ["Regular monitoring", "Beneficial insects", "Healthy soil"],
//     weatherImpact: "Warm, dry conditions promote rapid reproduction",
//     image: "/api/placeholder/200/150"
//   }
// ]
//
// const mockWeatherData = {
//   temperature: 28,
//   humidity: 65,
//   rainfall: 12,
//   windSpeed: 8,
//   uvIndex: 7,
//   forecast: "Partly cloudy with chance of rain"
// }
//
// const mockTrendingIssues = [
//   { disease: "Brown Spot", crop: "Rice", cases: 145, trend: "up" },
//   { disease: "Powdery Mildew", crop: "Grape", cases: 89, trend: "down" },
//   { disease: "Leaf Curl", crop: "Tomato", cases: 67, trend: "up" }
// ]
//
// const cropTypes = ["All", "Rice", "Wheat", "Potato", "Tomato", "Cotton", "Maize", "Sugarcane"]
//
// // Types for our state management
// type AnalysisState = {
//   isLoading: boolean;
//   error: string | null;
//   data: any | null;
//   progress: number;
// };
//
// type UIState = {
//   activeTab: 'scan' | 'results' | 'history' | 'trending' | 'database';
//   selectedCrop: string;
//   searchQuery: string;
//   showCamera: boolean;
//   selectedImage: string | null;
//   isFullscreen: boolean;
//   language: 'en' | 'hi';
// };
//
// type DataState = {
//   recentScans: any[];
//   trendingDiseases: any[];
//   diseaseDatabase: any[];
//   stats: any | null;
//   favorites: string[];
// };
//
// export default function CropDiseaseExpert() {
//   // State management
//   const [activeTab, setActiveTab] = useState<'scan' | 'database' | 'weather' | 'trending' | 'history'>('scan');
//   const [selectedCrop, setSelectedCrop] = useState('All');
//   const [searchQuery, setSearchQuery] = useState('');
//   const [showCamera, setShowCamera] = useState(false);
//   const [selectedImage, setSelectedImage] = useState<string | null>(null);
//   const [language, setLanguage] = useState<'en' | 'hi'>('en');
//   const [isAnalyzing, setIsAnalyzing] = useState(false);
//   const [analysisResults, setAnalysisResults] = useState<any>(null);
//   const [recentScans, setRecentScans] = useState<any[]>([]);
//   const [trendingDiseases, setTrendingDiseases] = useState(mockTrendingIssues);
//   const [diseaseDatabase, setDiseaseDatabase] = useState(mockDiseases);
//   const [stats, setStats] = useState<any>(null);
//   const [favourites, setFavourites] = useState<number[]>([]);
//
//   const [notifications, setNotifications] = useState(0);
//
//   // Toggle favorite status for a disease
//   const toggleFavourite = (diseaseId: number) => {
//     setFavourites(prev =>
//       prev.includes(diseaseId)
//         ? prev.filter(id => id !== diseaseId)
//         : [...prev, diseaseId]
//     );
//   };
//
//   // Refs
//   const fileInputRef = useRef<HTMLInputElement>(null);
//   const cameraRef = useRef<HTMLVideoElement>(null);
//   const resultsRef = useRef<HTMLDivElement>(null);
//
//   // Derived state
//   const t = translations[language] as typeof translations.en;
//
//   // Core handler functions
//   const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
//     const file = event.target.files?.[0];
//     if (!file) return;
//
//     if (fileInputRef.current) {
//       fileInputRef.current.value = '';
//     }
//
//     const imageUrl = URL.createObjectURL(file);
//     setSelectedImage(imageUrl);
//     setIsAnalyzing(true);
//
//     // Simulate analysis
//     setTimeout(() => {
//       setAnalysisResults(mockDiseases[0]);
//       setIsAnalyzing(false);
//     }, 2000);
//   };
//
//
//
//
//   const handleCameraCapture = async () => {
//     try {
//       const stream = await navigator.mediaDevices.getUserMedia({
//         video: { facingMode: 'environment' },
//         audio: false
//       });
//
//       if (cameraRef.current) {
//         cameraRef.current.srcObject = stream;
//         cameraRef.current.play();
//         setShowCamera(true);
//       }
//     } catch (error) {
//       console.error('Error accessing camera:', error);
//       toast.error('Could not access camera. Please check permissions.');
//     }
//   };
//
//   const capturePhoto = () => {
//     if (!cameraRef.current) return;
//
//     const canvas = document.createElement('canvas');
//     canvas.width = cameraRef.current.videoWidth;
//     canvas.height = cameraRef.current.videoHeight;
//     const ctx = canvas.getContext('2d');
//
//     if (ctx) {
//       ctx.drawImage(cameraRef.current, 0, 0, canvas.width, canvas.height);
//
//       canvas.toBlob(async (blob) => {
//         if (!blob) return;
//
//         const imageUrl = URL.createObjectURL(blob);
//         setSelectedImage(imageUrl);
//         setShowCamera(false);
//         setIsAnalyzing(true);
//
//         // Simulate analysis
//         setTimeout(() => {
//           setAnalysisResults(mockDiseases[0]);
//           setIsAnalyzing(false);
//         }, 2000);
//
//       }, 'image/jpeg', 0.9);
//
//       // Stop camera stream
//       const stream = cameraRef.current.srcObject as MediaStream;
//       if (stream) {
//         stream.getTracks().forEach(track => track.stop());
//       }
//     }
//   };
//
//
//   const getSeverityColor = (severity: string) => {
//     switch (severity) {
//       case "low": return "text-green-600 bg-green-100"
//       case "medium": return "text-yellow-600 bg-yellow-100"
//       case "high": return "text-orange-600 bg-orange-100"
//       case "critical": return "text-red-600 bg-red-100"
//       default: return "text-gray-600 bg-gray-100"
//     }
//   }
//
//   const filteredDiseases = diseaseDatabase.filter(disease =>
//     (selectedCrop === "All" || disease.crop === selectedCrop) &&
//     (searchQuery === "" || disease.name.toLowerCase().includes(searchQuery.toLowerCase()) || disease.crop.toLowerCase().includes(searchQuery.toLowerCase()))
//   )
//
//
//
//   useEffect(() => {
//     const debounceTimer = setTimeout(() => {
//       // Filter diseases based on search and crop selection
//     }, 500);
//
//     return () => clearTimeout(debounceTimer);
//   }, [searchQuery, selectedCrop]);
//
//   return (
//     <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-yellow-50">
//       {/* Header */}
//       <header className="bg-white shadow-lg border-b-2 border-green-200">
//         <div className="container mx-auto px-4 py-4">
//           <div className="flex items-center justify-between">
//             <div className="flex items-center space-x-4">
//               <Button variant="ghost" size="sm" className="lg:hidden" type="button">
//                 <ArrowLeft className="h-5 w-5" />
//               </Button>
//               <div className="flex items-center space-x-2">
//                 <div className="p-2 bg-green-100 rounded-full">
//                   <Leaf className="h-6 w-6 text-green-600" />
//                 </div>
//                 <h1 className="text-2xl font-bold text-green-800">{t.title}</h1>
//               </div>
//             </div>
//
//             <div className="flex items-center space-x-4">
//               <Button variant="ghost" size="sm" className="relative" type="button">
//                 <Bell className="h-5 w-5" />
//                 {notifications > 0 && (
//                   <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
//                     {notifications}
//                   </span>
//                 )}
//               </Button>
//
//               <select
//                 value={language}
//                 onChange={(e) => setLanguage(e.target.value as 'en' | 'hi')}
//                 className="px-3 py-1 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
//               >
//                 <option value="en">English</option>
//                 <option value="hi">हिंदी</option>
//               </select>
//             </div>
//           </div>
//         </div>
//       </header>
//
//       <div className="container mx-auto px-4 py-6">
//         <Tabs
//           value={activeTab}
//           onValueChange={(value) => setActiveTab(value as 'scan' | 'database' | 'weather' | 'trending' | 'history')}
//           className="w-full"
//         >
//           <TabsList className="grid w-full grid-cols-5 mb-6">
//             <TabsTrigger value="scan" className="flex items-center space-x-2">
//               <Camera className="h-4 w-4" />
//               <span className="hidden sm:inline">Scan</span>
//             </TabsTrigger>
//             <TabsTrigger value="database" className="flex items-center space-x-2">
//               <BookOpen className="h-4 w-4" />
//               <span className="hidden sm:inline">Database</span>
//             </TabsTrigger>
//             <TabsTrigger value="weather" className="flex items-center space-x-2">
//               <Sun className="h-4 w-4" />
//               <span className="hidden sm:inline">Weather</span>
//             </TabsTrigger>
//             <TabsTrigger value="trending" className="flex items-center space-x-2">
//               <TrendingUp className="h-4 w-4" />
//               <span className="hidden sm:inline">Trending</span>
//             </TabsTrigger>
//             <TabsTrigger value="history" className="flex items-center space-x-2">
//               <Clock className="h-4 w-4" />
//               <span className="hidden sm:inline">History</span>
//             </TabsTrigger>
//           </TabsList>
//
//           {/* Scan Tab */}
//           <TabsContent value="scan" className="space-y-6">
//             <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
//               {/* Upload Section */}
//               <Card className="border-2 border-dashed border-green-300 hover:border-green-400 transition-colors">
//                 <CardHeader className="text-center">
//                   <CardTitle className="flex items-center justify-center space-x-2">
//                     <Upload className="h-6 w-6 text-green-600" />
//                     <span>{t.uploadTitle}</span>
//                   </CardTitle>
//                   <p className="text-gray-600">{t.uploadDescription}</p>
//                 </CardHeader>
//                 <CardContent className="space-y-4">
//                   {!selectedImage && !showCamera && (
//                     <div className="space-y-4">
//                       <Button
//                         onClick={handleCameraCapture}
//                         className="w-full h-12 bg-green-600 hover:bg-green-700"
//                         type="button"
//                       >
//                         <Camera className="mr-2 h-5 w-5" />
//                         {t.takePhoto}
//                       </Button>
//
//                       <div className="relative">
//                         <div className="absolute inset-0 flex items-center">
//                           <span className="w-full border-t border-gray-300" />
//                         </div>
//                         <div className="relative flex justify-center text-sm">
//                           <span className="px-2 bg-white text-gray-500">{t.or}</span>
//                         </div>
//                       </div>
//
//                       <Button
//                         onClick={() => fileInputRef.current?.click()}
//                         variant="outline"
//                         className="w-full h-12 border-green-300 hover:bg-green-50"
//                         type="button"
//                       >
//                         <ImageIcon className="mr-2 h-5 w-5" />
//                         {t.uploadFromDevice}
//                       </Button>
//                       <input
//                         ref={fileInputRef}
//                         type="file"
//                         accept="image/*"
//                         onChange={handleImageUpload}
//                         className="hidden"
//                       />
//                     </div>
//                   )}
//
//                   {showCamera && (
//                     <div className="space-y-4">
//                       <video
//                         ref={cameraRef}
//                         autoPlay
//                         playsInline
//                         className="w-full rounded-lg"
//                       />
//                       <div className="flex space-x-2">
//                         <Button onClick={capturePhoto} className="flex-1 bg-green-600 hover:bg-green-700" type="button">
//                           <Camera className="mr-2 h-4 w-4" />
//                           Capture
//                         </Button>
//                         <Button
//                           onClick={() => {
//                             setShowCamera(false)
//                             const stream = cameraRef.current?.srcObject as MediaStream
//                             stream?.getTracks().forEach(track => track.stop())
//                           }}
//                           variant="outline"
//                           type="button"
//                         >
//                           <X className="h-4 w-4" />
//                         </Button>
//                       </div>
//                     </div>
//                   )}
//
//                   {selectedImage && (
//                     <div className="space-y-4">
//                       <div className="relative">
//                         <img
//                           src={selectedImage}
//                           alt="Selected crop"
//                           className="w-full h-64 object-cover rounded-lg"
//                         />
//                         <Button
//                           onClick={() => {
//                             setSelectedImage(null)
//                             setAnalysisResults(null)
//                           }}
//                           size="sm"
//                           variant="destructive"
//                           className="absolute top-2 right-2"
//                           type="button"
//                         >
//                           <X className="h-4 w-4" />
//                         </Button>
//                       </div>
//
//                       {isAnalyzing && (
//                         <div className="flex items-center justify-center space-x-2 p-4 bg-blue-50 rounded-lg">
//                           <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
//                           <span className="text-blue-600">{t.analyzing}</span>
//                         </div>
//                       )}
//                     </div>
//                   )}
//                 </CardContent>
//               </Card>
//
//               {/* Results Section */}
//               {analysisResults && (
//                 <Card className="border-l-4 border-l-green-500">
//                   <CardHeader>
//                     <CardTitle className="flex items-center justify-between">
//                       <span className="flex items-center space-x-2">
//                         <Check className="h-5 w-5 text-green-600" />
//                         <span>{t.results}</span>
//                       </span>
//                       <Button
//                         onClick={() => toggleFavourite(analysisResults.id)}
//                         variant="ghost"
//                         size="sm"
//                         type="button"
//                       >
//                         <Heart
//                           className={`h-4 w-4 ${favourites.includes(analysisResults.id) ? 'fill-red-500 text-red-500' : 'text-gray-400'}`}
//                         />
//                       </Button>
//                     </CardTitle>
//                   </CardHeader>
//                   <CardContent className="space-y-6">
//                     {/* Disease Info */}
//                     <div className="bg-gray-50 p-4 rounded-lg">
//                       <div className="flex items-center justify-between mb-2">
//                         <h3 className="font-semibold text-lg">
//                           {language === "hi" ? analysisResults.namePi : analysisResults.name}
//                         </h3>
//                         <span className={`px-2 py-1 rounded-full text-xs font-medium ${getSeverityColor(analysisResults.severity)}`}>
//                           {t[analysisResults.severity as keyof typeof t]}
//                         </span>
//                       </div>
//                       <p className="text-gray-600 mb-2">{analysisResults.description}</p>
//                       <div className="flex items-center space-x-4">
//                         <div className="flex items-center space-x-1">
//                           <Eye className="h-4 w-4 text-blue-600" />
//                           <span className="text-sm">{t.accuracy}: {analysisResults.confidence}%</span>
//                         </div>
//                         <div className="flex items-center space-x-1">
//                           <Sprout className="h-4 w-4 text-green-600" />
//                           <span className="text-sm">Crop: {analysisResults.crop}</span>
//                         </div>
//                       </div>
//                     </div>
//
//                     {/* Symptoms */}
//                     <div>
//                       <h4 className="font-medium mb-2 flex items-center space-x-2">
//                         <AlertTriangle className="h-4 w-4 text-yellow-600" />
//                         <span>Symptoms</span>
//                       </h4>
//                       <div className="flex flex-wrap gap-2">
//                         {analysisResults.symptoms?.map((symptom: string, index: number) => (
//                           <span key={index} className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm">
//                             {symptom}
//                           </span>
//                         ))}
//                       </div>
//                     </div>
//
//                     {/* Treatment Options */}
//                     <div>
//                       <h4 className="font-medium mb-3">{(t as any).treatment}</h4>
//                       <Tabs defaultValue="organic" className="w-full">
//                         <TabsList className="grid w-full grid-cols-3">
//                           <TabsTrigger value="organic">{(t as any).organic}</TabsTrigger>
//                           <TabsTrigger value="chemical">{(t as any).chemical}</TabsTrigger>
//                           <TabsTrigger value="cultural">{(t as any).cultural}</TabsTrigger>
//                         </TabsList>
//                         {analysisResults.treatments && Object.entries(analysisResults.treatments as Record<string, string[]>).map(([type, treatments]) => (
//                           <TabsContent key={type} value={type} className="mt-3">
//                             <ul className="space-y-1">
//                               {Array.isArray(treatments) && treatments.map((treatment: string, index: number) => (
//                                 <li key={index} className="flex items-center space-x-2">
//                                   <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
//                                   <span className="text-sm">{treatment}</span>
//                                 </li>
//                               ))}
//                             </ul>
//                           </TabsContent>
//                         ))}
//                       </Tabs>
//                     </div>
//
//                     {/* Weather Impact */}
//                     <div className="bg-blue-50 p-3 rounded-lg">
//                       <h4 className="font-medium mb-2 flex items-center space-x-2">
//                         <Thermometer className="h-4 w-4 text-blue-600" />
//                         <span>{t.weather}</span>
//                       </h4>
//                       <p className="text-sm text-gray-600">{analysisResults.weatherImpact}</p>
//                     </div>
//
//                     {/* Action Buttons */}
//                     <div className="flex flex-wrap gap-2">
//                       <Button size="sm" className="flex-1 min-w-32" type="button">
//                         <Download className="mr-2 h-4 w-4" />
//                         {t.saveReport}
//                       </Button>
//                       <Button size="sm" variant="outline" className="flex-1 min-w-32" type="button">
//                         <Share2 className="mr-2 h-4 w-4" />
//                         {t.shareResults}
//                       </Button>
//                       <Button size="sm" variant="outline" className="flex-1 min-w-32" type="button">
//                         <Phone className="mr-2 h-4 w-4" />
//                         {t.expert}
//                       </Button>
//                     </div>
//                   </CardContent>
//                 </Card>
//               )}
//             </div>
//           </TabsContent>
//
//           {/* Database Tab */}
//           <TabsContent value="database" className="space-y-6">
//             <div className="flex flex-col sm:flex-row gap-4 mb-6">
//               <div className="flex-1">
//                 <Input
//                   placeholder={t.searchDisease}
//                   value={searchQuery}
//                   onChange={(e) => setSearchQuery(e.target.value)}
//                   className="w-full"
//                 />
//               </div>
//               <select
//                 value={selectedCrop}
//                 onChange={(e) => setSelectedCrop(e.target.value)}
//                 className="px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
//               >
//                 {cropTypes.map(crop => (
//                   <option key={crop} value={crop}>{crop}</option>
//                 ))}
//               </select>
//             </div>
//
//             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
//               {filteredDiseases.map(disease => (
//                 <Card key={disease.id} className="hover:shadow-lg transition-shadow">
//                   <CardHeader className="pb-3">
//                     <div className="flex items-center justify-between">
//                       <CardTitle className="text-lg">
//                         {language === "hi" ? disease.namePi : disease.name}
//                       </CardTitle>
//                       <Button
//                         onClick={() => toggleFavourite(disease.id)}
//                         variant="ghost"
//                         size="sm"
//                         type="button"
//                       >
//                         <Heart
//                           className={`h-4 w-4 ${favourites.includes(disease.id) ? 'fill-red-500 text-red-500' : 'text-gray-400'}`}
//                         />
//                       </Button>
//                     </div>
//                     <div className="flex items-center justify-between">
//                       <span className="text-sm text-gray-600">{disease.crop}</span>
//                       <span className={`px-2 py-1 rounded-full text-xs font-medium ${getSeverityColor(disease.severity)}`}>
//                         {t[disease.severity as keyof typeof t]}
//                       </span>
//                     </div>
//                   </CardHeader>
//                   <CardContent>
//                     <p className="text-sm text-gray-600 mb-3">{disease.description}</p>
//                     <div className="space-y-2">
//                       <div className="text-xs">
//                         <span className="font-medium">Symptoms: </span>
//                         <span>{disease.symptoms.slice(0, 2).join(", ")}</span>
//                         {disease.symptoms.length > 2 && "..."}
//                       </div>
//                     </div>
//                   </CardContent>
//                   <CardFooter className="pt-0">
//                     <Button size="sm" variant="outline" className="w-full" type="button">
//                       <Eye className="mr-2 h-4 w-4" />
//                       View Details
//                     </Button>
//                   </CardFooter>
//                 </Card>
//               ))}
//             </div>
//           </TabsContent>
//
//           {/* Weather Tab */}
//           <TabsContent value="weather" className="space-y-6">
//             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
//               <Card>
//                 <CardHeader className="pb-3">
//                   <CardTitle className="flex items-center space-x-2">
//                     <Thermometer className="h-5 w-5 text-red-500" />
//                     <span>Temperature</span>
//                   </CardTitle>
//                 </CardHeader>
//                 <CardContent>
//                   <div className="text-3xl font-bold text-red-600">{mockWeatherData.temperature}°C</div>
//                   <p className="text-sm text-gray-600">Current temperature</p>
//                 </CardContent>
//               </Card>
//
//               <Card>
//                 <CardHeader className="pb-3">
//                   <CardTitle className="flex items-center space-x-2">
//                     <Droplets className="h-5 w-5 text-blue-500" />
//                     <span>Humidity</span>
//                   </CardTitle>
//                 </CardHeader>
//                 <CardContent>
//                   <div className="text-3xl font-bold text-blue-600">{mockWeatherData.humidity}%</div>
//                   <p className="text-sm text-gray-600">Relative humidity</p>
//                 </CardContent>
//               </Card>
//
//               <Card>
//                 <CardHeader className="pb-3">
//                   <CardTitle className="flex items-center space-x-2">
//                     <Wind className="h-5 w-5 text-gray-500" />
//                     <span>Wind Speed</span>
//                   </CardTitle>
//                 </CardHeader>
//                 <CardContent>
//                   <div className="text-3xl font-bold text-gray-600">{mockWeatherData.windSpeed} km/h</div>
//                   <p className="text-sm text-gray-600">Current wind speed</p>
//                 </CardContent>
//               </Card>
//             </div>
//
//             <Card>
//               <CardHeader>
//                 <CardTitle>Disease Risk Assessment</CardTitle>
//               </CardHeader>
//               <CardContent>
//                 <div className="space-y-4">
//                   <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
//                     <div className="flex items-center space-x-3">
//                       <AlertTriangle className="h-5 w-5 text-red-600" />
//                       <div>
//                         <p className="font-medium text-red-800">Late Blight Risk</p>
//                         <p className="text-sm text-red-600">High humidity favors development</p>
//                       </div>
//                     </div>
//                     <span className="px-2 py-1 bg-red-200 text-red-800 rounded-full text-sm font-medium">High</span>
//                   </div>
//
//                   <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
//                     <div className="flex items-center space-x-3">
//                       <Bug className="h-5 w-5 text-yellow-600" />
//                       <div>
//                         <p className="font-medium text-yellow-800">Aphid Activity</p>
//                         <p className="text-sm text-yellow-600">Warm conditions increase reproduction</p>
//                       </div>
//                     </div>
//                     <span className="px-2 py-1 bg-yellow-200 text-yellow-800 rounded-full text-sm font-medium">Medium</span>
//                   </div>
//
//                   <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
//                     <div className="flex items-center space-x-3">
//                       <Shield className="h-5 w-5 text-green-600" />
//                       <div>
//                         <p className="font-medium text-green-800">Fungal Diseases</p>
//                         <p className="text-sm text-green-600">Low risk due to dry conditions</p>
//                       </div>
//                     </div>
//                     <span className="px-2 py-1 bg-green-200 text-green-800 rounded-full text-sm font-medium">Low</span>
//                   </div>
//                 </div>
//
//                 <div className="mt-6 p-4 bg-blue-50 rounded-lg">
//                   <h4 className="font-medium text-blue-800 mb-2">Recommendations</h4>
//                   <ul className="text-sm text-blue-700 space-y-1">
//                     <li>• Monitor potato crops closely for late blight symptoms</li>
//                     <li>• Consider preventive fungicide application</li>
//                     <li>• Improve field drainage if possible</li>
//                     <li>• Check for aphid colonies on wheat crops</li>
//                   </ul>
//                 </div>
//               </CardContent>
//             </Card>
//           </TabsContent>
//
//           {/* Trending Tab */}
//           <TabsContent value="trending" className="space-y-6">
//             <Card>
//               <CardHeader>
//                 <CardTitle className="flex items-center space-x-2">
//                   <TrendingUp className="h-5 w-5 text-orange-500" />
//                   <span>Current Disease Outbreaks</span>
//                 </CardTitle>
//               </CardHeader>
//               <CardContent>
//                 <div className="space-y-4">
//                   {trendingDiseases.map((issue, index) => (
//                     <div key={index} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
//                       <div className="flex items-center space-x-4">
//                         <div className={`p-2 rounded-full ${issue.trend === 'up' ? 'bg-red-100' : 'bg-green-100'}`}>
//                           <TrendingUp className={`h-4 w-4 ${issue.trend === 'up' ? 'text-red-600' : 'text-green-600 rotate-180'}`} />
//                         </div>
//                         <div>
//                           <p className="font-medium">{issue.disease}</p>
//                           <p className="text-sm text-gray-600">{issue.crop} crops affected</p>
//                         </div>
//                       </div>
//                       <div className="text-right">
//                         <p className="font-bold text-lg">{issue.cases}</p>
//                         <p className="text-sm text-gray-600">reported cases</p>
//                       </div>
//                     </div>
//                   ))}
//                 </div>
//               </CardContent>
//             </Card>
//
//             <Card>
//               <CardHeader>
//                 <CardTitle>Regional Disease Map</CardTitle>
//               </CardHeader>
//               <CardContent>
//                 <div className="h-64 bg-gradient-to-br from-green-100 to-blue-100 rounded-lg flex items-center justify-center">
//                   <div className="text-center">
//                     <MapPin className="h-12 w-12 text-gray-400 mx-auto mb-2" />
//                     <p className="text-gray-600">Interactive disease map</p>
//                     <p className="text-sm text-gray-500">Showing disease hotspots in your region</p>
//                   </div>
//                 </div>
//
//                 <div className="mt-4 grid grid-cols-2 gap-4">
//                   <div className="text-center p-3 bg-red-50 rounded-lg">
//                     <div className="text-2xl font-bold text-red-600">23</div>
//                     <div className="text-sm text-red-700">High Risk Areas</div>
//                   </div>
//                   <div className="text-center p-3 bg-yellow-50 rounded-lg">
//                     <div className="text-2xl font-bold text-yellow-600">45</div>
//                     <div className="text-sm text-yellow-700">Moderate Risk Areas</div>
//                   </div>
//                 </div>
//               </CardContent>
//             </Card>
//           </TabsContent>
//
//           {/* History Tab */}
//           <TabsContent value="history" className="space-y-6">
//             <div className="flex items-center justify-between">
//               <h2 className="text-xl font-semibold">{t.recentScans}</h2>
//               <Button variant="outline" size="sm" type="button">
//                 <Filter className="mr-2 h-4 w-4" />
//                 Filter
//               </Button>
//             </div>
//
//             {recentScans.length === 0 ? (
//               <Card>
//                 <CardContent className="flex flex-col items-center justify-center py-12">
//                   <Clock className="h-12 w-12 text-gray-400 mb-4" />
//                   <p className="text-gray-600">{t.noRecentScans}</p>
//                   <Button className="mt-4" onClick={() => setActiveTab("scan")} type="button">
//                     <Camera className="mr-2 h-4 w-4" />
//                     {t.scanNow}
//                   </Button>
//                 </CardContent>
//               </Card>
//             ) : (
//               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
//                 {recentScans.map((scan) => (
//                   <Card key={scan.id} className="hover:shadow-lg transition-shadow">
//                     <CardHeader className="pb-3">
//                       <div className="flex items-center justify-between">
//                         <CardTitle className="text-lg">{scan.disease}</CardTitle>
//                         <span className={`px-2 py-1 rounded-full text-xs font-medium ${getSeverityColor(scan.severity)}`}>
//                           {t[scan.severity as keyof typeof t]}
//                         </span>
//                       </div>
//                       <p className="text-sm text-gray-600">{scan.crop}</p>
//                     </CardHeader>
//                     <CardContent>
//                       {scan.image && (
//                         <img
//                           src={scan.image}
//                           alt="Scanned crop"
//                           className="w-full h-32 object-cover rounded-lg mb-3"
//                         />
//                       )}
//                       <div className="flex items-center justify-between text-sm text-gray-500">
//                         <span className="flex items-center space-x-1">
//                           <Calendar className="h-4 w-4" />
//                           <span>{scan.date}</span>
//                         </span>
//                         <Button variant="ghost" size="sm" type="button">
//                           <Eye className="h-4 w-4" />
//                         </Button>
//                       </div>
//                     </CardContent>
//                   </Card>
//                 ))}
//               </div>
//             )}
//
//             {/* Statistics */}
//             <Card>
//               <CardHeader>
//                 <CardTitle>Scan Statistics</CardTitle>
//               </CardHeader>
//               <CardContent>
//                 <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
//                   <div className="text-center">
//                     <div className="text-2xl font-bold text-blue-600">{stats?.totalScans || 0}</div>
//                     <div className="text-sm text-gray-600">Total Scans</div>
//                   </div>
//                   <div className="text-center">
//                     <div className="text-2xl font-bold text-green-600">
//                       {stats?.severityBreakdown?.low || 0}
//                     </div>
//                     <div className="text-sm text-gray-600">Low Risk</div>
//                   </div>
//                   <div className="text-center">
//                     <div className="text-2xl font-bold text-yellow-600">
//                       {stats?.severityBreakdown?.medium || 0}
//                     </div>
//                     <div className="text-sm text-gray-600">Medium Risk</div>
//                   </div>
//                   <div className="text-center">
//                     <div className="text-2xl font-bold text-red-600">
//                       {stats?.severityBreakdown?.high || 0}
//                     </div>
//                     <div className="text-sm text-gray-600">High Risk</div>
//                   </div>
//                 </div>
//               </CardContent>
//             </Card>
//           </TabsContent>
//         </Tabs>
//       </div>
//
//       {/* Emergency Contact FAB */}
//       <div className="fixed bottom-6 right-6 z-50">
//         <Button
//           size="lg"
//           className="rounded-full h-14 w-14 bg-red-600 hover:bg-red-700 shadow-lg"
//           title={t.emergencyContact}
//           type="button"
//         >
//           <Phone className="h-6 w-6" />
//         </Button>
//       </div>
//
//       {/* Quick Actions FAB Menu */}
//       <div className="fixed bottom-6 left-6 z-50 space-y-3">
//         <Button
//           size="sm"
//           className="rounded-full bg-green-600 hover:bg-green-700 shadow-lg"
//           onClick={() => setActiveTab("scan")}
//           title="Quick Scan"
//           type="button"
//         >
//           <Camera className="h-4 w-4" />
//         </Button>
//         <Button
//           size="sm"
//           variant="outline"
//           className="rounded-full bg-white shadow-lg"
//           title="Chat with Expert"
//           type="button"
//         >
//           <MessageCircle className="h-4 w-4" />
//         </Button>
//       </div>
//     </div>
//   )
// }
