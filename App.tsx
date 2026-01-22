
import React, { useState, useMemo } from 'react';
import { 
  Building2, 
  Users, 
  User,
  Printer, 
  ChevronRight, 
  ChevronLeft, 
  ClipboardCheck, 
  Trophy, 
  Activity, 
  CalendarDays,
  FileText, 
  Layout, 
  CheckCircle2, 
  Trash2,
  Zap,
  UploadCloud,
  Layers,
  Info,
  ChevronDown,
  Eye,
  Download,
  X,
  Settings2,
  Maximize,
  Minimize,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  MoveVertical,
  Settings,
  RotateCcw
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Stage, Student, AppState, GroupData, CurriculumConfig } from './types.ts';
import { LEVELS_CONFIG, TERM_MAPPING } from './constants.ts';
import { geminiService } from './services/geminiService.ts';

const LEVEL_NAMES: Record<string, string> = {
  "1": "أولى إبتدائي",
  "2": "ثانية إبتدائي",
  "3": "ثالثة إبتدائي",
  "4": "رابعة إبتدائي",
  "5": "خامسة إبتدائي"
};

const ARABIC_LEVEL_TO_NUM: Record<string, string> = {
  "أولى": "1", "الاولى": "1",
  "ثانية": "2", "الثانية": "2",
  "ثالثة": "3", "الثالثة": "3",
  "رابعة": "4", "الرابعة": "4",
  "خامسة": "5", "الخامسة": "5"
};

interface PreviewSettings {
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  verticalOffset: number;
}

const App: React.FC = () => {
  const [currentStage, setCurrentStage] = useState<Stage>(Stage.DATA_IMPORT);
  const [state, setState] = useState<AppState>({
    currentGroupIndex: 0,
    groups: [],
    selectedPages: {
      diagnostic: true,
      summative: true,
      performance: true,
      attendance: true,
      separator: false
    }
  });

  const [previewSettings, setPreviewSettings] = useState<PreviewSettings>({
    marginTop: 5,
    marginBottom: 5,
    marginLeft: 5,
    marginRight: 5,
    verticalOffset: 0
  });
  const [showSettings, setShowSettings] = useState(false);

  const [aiObservations, setAiObservations] = useState<Record<number, string>>({});
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);

  const extractInfo = (data: any[][], sheetName: string): GroupData => {
    const row4Cells = data[3] || [];
    const row4Text = row4Cells.filter(c => c).join(' ');
    const schoolName = row4Text.replace(/المؤسسة\s*[:：]\s*/g, '').trim() || 'مدرسة الشهيد بني العربي';

    const row5Cells = data[4] || [];
    const row5Text = row5Cells.filter(c => c).join(' ');
    
    const academicYearMatch = row5Text.match(/\d{4}-\d{4}/) || row5Text.match(/\d{4}\/\d{4}/);
    const academicYear = academicYearMatch ? academicYearMatch[0] : '2025/2026';
    
    let term = 'الفصل الأول';
    if (row5Text.includes('الثاني')) term = 'الفصل الثاني';
    if (row5Text.includes('الثالث')) term = 'الفصل الثالث';
    
    let section = sheetName; 
    if (row5Text.includes('الفوج التربوي')) {
      const parts = row5Text.split('الفوج التربوي');
      const afterFoj = parts[1]?.split('مادة')[0] || '';
      let rawSection = afterFoj.replace(/[:：]/g, '').trim() || sheetName;
      
      if (rawSection.endsWith('1')) {
        section = rawSection.slice(0, -1).trim() + ' (أ)';
      } else if (rawSection.endsWith('2')) {
        section = rawSection.slice(0, -1).trim() + ' (ب)';
      } else {
        section = `(${rawSection})`;
      }
    } else {
      section = `(${sheetName})`;
    }
    
    let level = '1';
    for (const [key, val] of Object.entries(ARABIC_LEVEL_TO_NUM)) {
      if (section.includes(key) || sheetName.includes(key)) {
        level = val;
        break;
      }
    }

    const students: Student[] = [];
    for (let i = 9; i < data.length; i++) {
      const row = data[i];
      if (row && (row[1] || row[2])) {
        const name = `${row[1] || ''} ${row[2] || ''}`.trim();
        if (name && isNaN(Number(name))) {
          students.push({ id: students.length + 1, name, isExempt: false });
        }
      }
    }

    return { sheetName, schoolName, academicYear, section, term, level, students };
  };

  const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const bstr = event.target?.result;
      const workbook = XLSX.read(bstr, { type: 'binary' });
      
      const groups: GroupData[] = workbook.SheetNames.map(name => {
        const worksheet = workbook.Sheets[name];
        const data = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });
        return extractInfo(data, name);
      }).filter(g => g.students.length > 0);

      if (groups.length > 0) {
        setState(prev => ({ ...prev, groups, currentGroupIndex: 0 }));
      } else {
        alert("لم يتم العثور على بيانات تلاميذ في هذا الملف.");
      }
    };
    reader.readAsBinaryString(file);
  };

  const activeGroup = state.groups[state.currentGroupIndex] || null;

  const toggleExempt = (studentId: number) => {
    if (!activeGroup) return;
    const newGroups = [...state.groups];
    const group = newGroups[state.currentGroupIndex];
    group.students = group.students.map(s => 
      s.id === studentId ? { ...s, isExempt: !s.isExempt } : s
    );
    setState(prev => ({ ...prev, groups: newGroups }));
  };

  const generateAIObservations = async () => {
    if (!activeGroup) return;
    setIsGeneratingAi(true);
    const newObservations: Record<number, string> = {};
    const studentsToProcess = activeGroup.students.slice(0, 35);
    for (const student of studentsToProcess) {
      if (!student.isExempt) {
        const obs = await geminiService.generateStudentObservation(activeGroup.level, "جيد");
        newObservations[student.id] = obs;
      }
    }
    setAiObservations(newObservations);
    setIsGeneratingAi(false);
  };

  const currentCurriculum = useMemo(() => {
    if (!activeGroup) return null;
    return LEVELS_CONFIG[activeGroup.level]?.[activeGroup.term] || LEVELS_CONFIG["1"]["الفصل الأول"];
  }, [activeGroup]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Header - No Print */}
      <div className="no-print bg-white border-b sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto p-4 sm:p-6">
          <header className="flex flex-col lg:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-5">
              <div className="p-3 bg-blue-600 rounded-2xl text-white shadow-lg">
                <Layout className="w-8 h-8" />
              </div>
              <div className="text-right">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">منصة الإدارة التربوية</h1>
                <p className="text-slate-500 font-bold text-xs">نظام معالجة وتوليد الوثائق الرسمية</p>
              </div>
            </div>
            
            <nav className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-2xl">
              {[1, 2, 3].map((s) => (
                <button
                  key={s}
                  onClick={() => state.groups.length > 0 && setCurrentStage(s as Stage)}
                  className={`px-6 py-2.5 rounded-xl text-xs font-black transition-all ${
                    currentStage === s 
                      ? 'bg-white text-blue-700 shadow-md border border-slate-100' 
                      : 'text-slate-400 hover:bg-slate-200/50'
                  }`}
                >
                  {s === 1 ? 'البيانات' : s === 2 ? 'تخصيص' : 'معاينة وطباعة'}
                </button>
              ))}
            </nav>
          </header>
        </div>
      </div>

      <main className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 no-print">
        <div className="bg-white rounded-3xl p-6 sm:p-10 border border-slate-200 shadow-xl min-h-[600px]">
          {currentStage === Stage.DATA_IMPORT && (
            <div className="space-y-10 animate-in fade-in zoom-in-95 duration-500">
              {!state.groups.length ? (
                <div className="max-w-3xl mx-auto text-center space-y-8 mt-20">
                  <div className="space-y-4">
                    <h2 className="text-3xl font-black text-slate-800 tracking-tight leading-tight">ابدأ برفع ملف الرقمنة الإكسيل</h2>
                    <p className="text-slate-500 font-bold max-w-lg mx-auto">سيقوم النظام باستخراج أسماء التلاميذ، اسم المؤسسة، المستوى، والفوج التربوي بشكل آلي تماماً.</p>
                  </div>
                  <label className="flex flex-col items-center justify-center p-20 bg-blue-50/50 border-4 border-dashed border-blue-200 rounded-[3rem] cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-all group">
                    <input type="file" className="hidden" accept=".xlsx,.xls" onChange={handleExcelImport} />
                    <UploadCloud className="w-20 h-20 text-blue-300 group-hover:text-blue-600 group-hover:scale-110 transition-all mb-6" />
                    <span className="text-xl font-black text-slate-700">اضغط هنا لاختيار الملف</span>
                  </label>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                  <div className="lg:col-span-4 space-y-6">
                    <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200 space-y-6">
                      <h3 className="text-lg font-black text-blue-900 flex items-center gap-2 pb-4 border-b">
                        <Info className="w-5 h-5" /> تفاصيل الفوج المستخرجة
                      </h3>
                      
                      <div className="space-y-4">
                        <div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
                          <p className="text-[10px] font-black text-blue-400 uppercase mb-1">المؤسسة</p>
                          <p className="text-base font-black text-slate-800">{activeGroup?.schoolName}</p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
                            <p className="text-[10px] font-black text-emerald-400 uppercase mb-1">السنة</p>
                            <p className="text-sm font-black text-slate-800">{activeGroup?.academicYear}</p>
                          </div>
                          <div className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
                            <p className="text-[10px] font-black text-amber-400 uppercase mb-1">الفصل</p>
                            <p className="text-sm font-black text-slate-800">{activeGroup?.term}</p>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-black text-slate-600 pr-1">تبديل الفوج التربوي:</label>
                          <select 
                            value={state.currentGroupIndex}
                            onChange={(e) => setState(prev => ({ ...prev, currentGroupIndex: Number(e.target.value) }))}
                            className="w-full px-5 py-4 bg-blue-600 text-white border-none rounded-2xl font-black text-lg outline-none cursor-pointer hover:bg-blue-700 transition-all appearance-none text-center"
                          >
                            {state.groups.map((g, idx) => (
                              <option key={idx} value={idx} className="bg-white text-slate-800">{g.section}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      
                      <button onClick={() => setState(prev => ({ ...prev, groups: [] }))} className="w-full py-3 text-red-500 font-bold text-sm bg-red-50 hover:bg-red-100 rounded-xl transition-colors border border-red-100 flex items-center justify-center gap-2">
                        <Trash2 className="w-4 h-4" /> مسح البيانات الحالية
                      </button>
                    </div>
                  </div>

                  <div className="lg:col-span-8">
                    <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden flex flex-col h-full">
                      <div className="p-5 bg-slate-50 border-b flex items-center justify-between">
                        <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                          <Users className="w-5 h-5 text-blue-500" /> إدارة القائمة ({activeGroup?.students.length} تلميذ)
                        </h3>
                      </div>
                      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[450px] overflow-y-auto custom-scrollbar">
                        {activeGroup?.students.map((student, idx) => (
                          <label key={student.id} className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer ${student.isExempt ? 'bg-red-50 border-red-100' : 'bg-white border-slate-100 hover:border-blue-200'}`}>
                            <div className="flex items-center gap-3">
                              <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black ${student.isExempt ? 'bg-red-200 text-red-700' : 'bg-slate-100 text-slate-500'}`}>{idx + 1}</span>
                              <span className={`text-sm font-black ${student.isExempt ? 'text-red-700 line-through opacity-70' : 'text-slate-800'}`}>{student.name}</span>
                            </div>
                            <input type="checkbox" className="hidden" checked={student.isExempt} onChange={() => toggleExempt(student.id)} />
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${student.isExempt ? 'bg-red-500 border-red-500' : 'border-slate-300'}`}>
                              {student.isExempt && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {currentStage === Stage.DOC_SELECTION && (
            <div className="space-y-12 animate-in slide-in-from-left-6 duration-500 max-w-5xl mx-auto">
              <div className="text-center space-y-3">
                <h2 className="text-3xl font-black text-slate-900">اختر الوثائق المراد استخراجها</h2>
                <p className="text-slate-500 font-bold">حدد الوثائق التي ترغب في تضمينها في ملف الطباعة النهائي</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[
                  { id: 'diagnostic', label: 'التقويم التشخيصي', icon: <ClipboardCheck className="w-8 h-8" />, color: 'blue', desc: 'لتقييم المستوى الأولي للتلاميذ' },
                  { id: 'summative', label: 'التقويم التحصيلي', icon: <Trophy className="w-8 h-8" />, color: 'indigo', desc: 'رصد النتائج النهائية للفصل' },
                  { id: 'performance', label: 'بطاقة أداء التلميذ', icon: <Activity className="w-8 h-8" />, color: 'purple', desc: 'متابعة شاملة للأداء البدني' },
                  { id: 'attendance', label: 'سجل المناداة', icon: <CalendarDays className="w-8 h-8" />, color: 'emerald', desc: 'تنظيم الحضور والحصص الأسبوعية' },
                  { id: 'separator', label: 'الورقة الفاصلة', icon: <Layers className="w-8 h-8" />, color: 'amber', desc: 'لتنظيم الملف الورقي' },
                ].map(doc => {
                  const isSelected = state.selectedPages[doc.id as keyof typeof state.selectedPages];
                  const colorMap: Record<string, string> = {
                    blue: 'blue-500', indigo: 'indigo-500', purple: 'purple-500', emerald: 'emerald-500', amber: 'amber-500'
                  };
                  const color = colorMap[doc.color];
                  return (
                    <button 
                      key={doc.id} 
                      onClick={() => setState(prev => ({ ...prev, selectedPages: { ...prev.selectedPages, [doc.id]: !prev.selectedPages[doc.id as keyof typeof prev.selectedPages] } }))} 
                      className={`p-8 rounded-[2.5rem] border-4 transition-all flex flex-col items-center gap-4 text-center group ${isSelected ? `border-${color} bg-${doc.color}-50/30 shadow-xl scale-[1.02]` : 'border-white bg-white hover:border-slate-100 shadow-md'}`}
                    >
                      <div className={`p-5 rounded-3xl transition-all ${isSelected ? `bg-${color} text-white shadow-lg` : 'bg-slate-100 text-slate-400 group-hover:bg-slate-200'}`}>
                        {doc.icon}
                      </div>
                      <span className={`text-lg font-black ${isSelected ? 'text-slate-900' : 'text-slate-600'}`}>{doc.label}</span>
                      <p className="text-[10px] text-slate-400 font-bold">{doc.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {currentStage === Stage.FINAL_PREVIEW && (
            <div className="flex flex-col items-center justify-center space-y-10 py-20 text-center animate-in zoom-in-95 duration-500">
              <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4">
                <CheckCircle2 className="w-12 h-12" />
              </div>
              <div className="space-y-4">
                <h2 className="text-4xl font-black text-slate-900">المعالجة اكتملت بنجاح</h2>
                <p className="text-xl text-slate-500 font-bold max-w-xl mx-auto">تم دمج بيانات {activeGroup?.students.length} تلميذ في القوالب المختارة. اضغط على المعاينة أدناه للتحقق قبل الطباعة.</p>
              </div>
              
              <div className="flex flex-wrap items-center justify-center gap-4 pt-6">
                <button 
                  onClick={generateAIObservations} 
                  disabled={isGeneratingAi} 
                  className="px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black flex items-center gap-3 shadow-lg disabled:opacity-50"
                >
                  {isGeneratingAi ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : <Zap className="w-5 h-5 text-yellow-300" />}
                  توليد ملاحظات AI لـ Gemini
                </button>
                
                <button 
                  onClick={() => window.print()} 
                  className="px-12 py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black flex items-center gap-3 shadow-xl"
                >
                  <Printer className="w-6 h-6" /> طباعة جميع الوثائق المحددة
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="no-print p-6 max-w-7xl mx-auto w-full flex justify-between items-center bg-white border-t sm:rounded-t-3xl shadow-2xl mt-auto">
        <button onClick={() => setCurrentStage(prev => Math.max(prev - 1, 1))} disabled={currentStage === 1} className="flex items-center gap-3 px-8 py-4 text-slate-500 font-black disabled:opacity-30 hover:bg-slate-50 rounded-2xl transition-all">
          <ChevronRight className="w-5 h-5" /> المرحلة السابقة
        </button>
        <button onClick={() => setCurrentStage(prev => Math.min(prev + 1, 3))} disabled={currentStage === 3 || state.groups.length === 0} className="flex items-center gap-4 px-12 py-4 bg-blue-600 text-white rounded-2xl font-black hover:bg-blue-700 shadow-xl transition-all disabled:opacity-30">
          الاستمرار <ChevronLeft className="w-5 h-5" />
        </button>
      </footer>

      {/* Full-Screen Preview Overlay */}
      {currentStage === Stage.FINAL_PREVIEW && activeGroup && (
        <div className="preview-overlay">
          
          <div className="pages-container">
            {state.selectedPages.separator && (
              <div className="print-page portrait-page">
                <div className="border-[15px] border-double border-slate-900 p-16 w-full h-full flex flex-col items-center justify-center space-y-20 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-full opacity-[0.03] pointer-events-none select-none">
                       <Layout className="w-full h-full" />
                    </div>
                    <div className="border-8 border-slate-900 px-16 py-10 rounded-[3rem] bg-white shadow-2xl relative z-10">
                      <h1 className="text-8xl font-black text-slate-900">{activeGroup.term}</h1>
                    </div>
                    <div className="text-center space-y-6 relative z-10">
                      <h2 className="text-5xl font-black text-slate-800 tracking-tight">دفتر متابعة التقويم التربوي</h2>
                      <div className="bg-slate-900 text-white px-14 py-5 rounded-3xl text-3xl font-black inline-block shadow-xl">الميدان: {TERM_MAPPING[activeGroup.term]}</div>
                    </div>
                    <div className="text-3xl font-black text-slate-300 border-t-4 border-slate-100 pt-10 w-3/4 text-center">الموسم الدراسي: {activeGroup.academicYear}</div>
                </div>
              </div>
            )}

            {state.selectedPages.diagnostic && (
              <AssessmentPage 
                title="تقويم التشخيصي للكفاءة الختامية" 
                group={activeGroup} 
                curriculum={currentCurriculum!} 
                observations={aiObservations} 
                settings={previewSettings}
              />
            )}

            {state.selectedPages.summative && (
              <AssessmentPage 
                title="تقويم التحصيلي للكفاءة الختامية" 
                group={activeGroup} 
                curriculum={currentCurriculum!} 
                observations={aiObservations} 
                settings={previewSettings}
              />
            )}

            {state.selectedPages.performance && (
              <PerformanceCardPage 
                group={activeGroup} 
                curriculum={currentCurriculum!} 
                observations={aiObservations} 
                settings={previewSettings}
              />
            )}

            {state.selectedPages.attendance && (
              <AttendancePage group={activeGroup} settings={previewSettings} />
            )}
          </div>

          {/* Floating Actions UI (Strictly No-Print) */}
          <div className="no-print fixed bottom-10 left-1/2 -translate-x-1/2 z-[300] flex flex-col items-center gap-6 w-full max-w-4xl px-4">
             
             {/* Settings Popover */}
             {showSettings && (
               <div className="bg-white border border-slate-200 p-8 sm:p-10 rounded-[3rem] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.6)] w-full max-w-lg flex flex-col gap-8 animate-in slide-in-from-bottom-12 duration-500">
                 <div className="flex items-center justify-between pb-6 border-b border-slate-100">
                   <h4 className="text-xl font-black text-slate-800 flex items-center gap-4">
                     <Settings className="w-8 h-8 text-blue-600" /> إعدادات الهوامش والمحتوى
                   </h4>
                   <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X className="w-6 h-6 text-slate-400"/></button>
                 </div>
                 
                 {/* 2x2 Grid for Margins - Ranges up to 1000mm */}
                 <div className="grid grid-cols-2 gap-x-10 gap-y-10">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-black text-slate-500 flex items-center gap-2">الأعلى <ArrowUp className="w-4 h-4 opacity-30"/></label>
                        <span className="text-xs font-black bg-blue-100 text-blue-800 px-3 py-1 rounded-full">{previewSettings.marginTop}</span>
                      </div>
                      <input type="range" min="0" max="1000" step="1" value={previewSettings.marginTop} onChange={(e) => setPreviewSettings(prev => ({ ...prev, marginTop: parseInt(e.target.value) }))} className="w-full accent-blue-600 h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer" />
                    </div>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-black text-slate-500 flex items-center gap-2">الأسفل <ArrowDown className="w-4 h-4 opacity-30"/></label>
                        <span className="text-xs font-black bg-blue-100 text-blue-800 px-3 py-1 rounded-full">{previewSettings.marginBottom}</span>
                      </div>
                      <input type="range" min="0" max="1000" step="1" value={previewSettings.marginBottom} onChange={(e) => setPreviewSettings(prev => ({ ...prev, marginBottom: parseInt(e.target.value) }))} className="w-full accent-blue-600 h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer" />
                    </div>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-black text-slate-500 flex items-center gap-2">اليمين <ArrowRight className="w-4 h-4 opacity-30"/></label>
                        <span className="text-xs font-black bg-blue-100 text-blue-800 px-3 py-1 rounded-full">{previewSettings.marginRight}</span>
                      </div>
                      <input type="range" min="0" max="1000" step="1" value={previewSettings.marginRight} onChange={(e) => setPreviewSettings(prev => ({ ...prev, marginRight: parseInt(e.target.value) }))} className="w-full accent-blue-600 h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer" />
                    </div>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-black text-slate-500 flex items-center gap-2">اليسار <ArrowLeft className="w-4 h-4 opacity-30"/></label>
                        <span className="text-xs font-black bg-blue-100 text-blue-800 px-3 py-1 rounded-full">{previewSettings.marginLeft}</span>
                      </div>
                      <input type="range" min="0" max="1000" step="1" value={previewSettings.marginLeft} onChange={(e) => setPreviewSettings(prev => ({ ...prev, marginLeft: parseInt(e.target.value) }))} className="w-full accent-blue-600 h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer" />
                    </div>
                 </div>

                 {/* Vertical Offset - Ranges up to 2000mm */}
                 <div className="space-y-6 pt-8 border-t border-slate-50">
                   <div className="flex items-center justify-between">
                     <label className="text-sm font-black text-slate-600 flex items-center gap-3">
                       <MoveVertical className="w-6 h-6 text-emerald-600" /> إزاحة المحتوى (مم)
                     </label>
                     <div className="w-16 h-16 flex items-center justify-center bg-emerald-100 text-emerald-800 font-black rounded-full text-xl shadow-md border-2 border-emerald-50">
                        {previewSettings.verticalOffset}
                     </div>
                   </div>
                   <div className="flex items-center gap-5">
                      <button onClick={() => setPreviewSettings(prev => ({ ...prev, verticalOffset: Math.max(-2000, prev.verticalOffset - 10) }))} className="p-4 bg-slate-100 hover:bg-slate-200 rounded-3xl transition-all shadow-sm">
                        <ArrowUp className="w-7 h-7 text-slate-700" />
                      </button>
                      <input type="range" min="-2000" max="2000" step="1" value={previewSettings.verticalOffset} onChange={(e) => setPreviewSettings(prev => ({ ...prev, verticalOffset: parseInt(e.target.value) }))} className="flex-1 accent-emerald-600 h-2.5 bg-slate-100 rounded-lg appearance-none cursor-pointer" />
                      <button onClick={() => setPreviewSettings(prev => ({ ...prev, verticalOffset: Math.min(2000, prev.verticalOffset + 10) }))} className="p-4 bg-slate-100 hover:bg-slate-200 rounded-3xl transition-all shadow-sm">
                        <ArrowDown className="w-7 h-7 text-slate-700" />
                      </button>
                   </div>
                 </div>

                 <button 
                  onClick={() => setPreviewSettings({ marginTop: 5, marginBottom: 5, marginLeft: 5, marginRight: 5, verticalOffset: 0 })}
                  className="w-full py-4 text-xs font-black text-slate-400 hover:text-blue-600 transition-colors uppercase tracking-widest border border-slate-50 rounded-2xl hover:bg-blue-50 flex items-center justify-center gap-2"
                 >
                   <RotateCcw className="w-4 h-4" /> إعادة الضبط الافتراضي (5 مم)
                 </button>
               </div>
             )}

             {/* Main Professional Bar */}
             <div className="flex items-center gap-6 bg-white/95 backdrop-blur-3xl px-6 py-4 rounded-[4rem] shadow-[0_30px_70px_rgba(0,0,0,0.6)] border border-white/40">
               {/* Close - Red Circle */}
               <button 
                 onClick={() => setCurrentStage(Stage.DOC_SELECTION)} 
                 className="w-16 h-16 flex items-center justify-center bg-red-50 text-red-500 rounded-full hover:bg-red-100 hover:scale-110 active:scale-95 transition-all shadow-lg group"
               >
                  <X className="w-8 h-8 group-hover:rotate-90 transition-transform duration-300" />
               </button>

               {/* Print - Large Blue Pill */}
               <button 
                 onClick={() => window.print()} 
                 className="flex items-center gap-6 px-16 h-18 bg-blue-600 text-white rounded-full font-black text-2xl hover:bg-blue-700 hover:scale-[1.05] active:scale-95 transition-all shadow-[0_15px_35px_rgba(37,99,235,0.6)] ring-4 ring-blue-600/10"
               >
                  <Printer className="w-8 h-8" /> طباعة
               </button>

               {/* Settings Toggle - Dark Circle */}
               <button 
                 onClick={() => setShowSettings(!showSettings)} 
                 className={`w-16 h-16 flex items-center justify-center rounded-full transition-all shadow-lg ${showSettings ? 'bg-slate-900 text-white rotate-180' : 'bg-slate-100 text-slate-800 hover:bg-slate-200 hover:scale-110'}`}
               >
                  <Settings2 className="w-9 h-9" />
               </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

const AssessmentPage: React.FC<{ title: string, group: GroupData, curriculum: CurriculumConfig, observations: Record<number, string>, settings: PreviewSettings }> = ({ title, group, curriculum, observations, settings }) => (
  <div 
    className="print-page portrait-page border border-black flex flex-col"
    style={{ 
      paddingTop: `${settings.marginTop}mm`, 
      paddingBottom: `${settings.marginBottom}mm`, 
      paddingLeft: `${settings.marginLeft}mm`, 
      paddingRight: `${settings.marginRight}mm` 
    }}
  >
    <div style={{ marginTop: `${settings.verticalOffset}mm` }}>
      {/* Header Pill Title */}
      <div className="text-center mb-4">
        <div className="border-[2.5px] border-black px-16 py-2 inline-block rounded-[40px] font-black text-[26px] bg-white leading-tight shadow-sm">
          {title}
        </div>
      </div>
      
      {/* Header Info Layout */}
      <div className="flex justify-between items-start text-[12px] font-bold mb-2 px-1">
        <div className="space-y-0.5 text-right w-1/2">
          <p>المؤسسة: <span className="font-black">مدرسة {group.schoolName}</span></p>
          <p>المستوى: <span className="font-black">{LEVEL_NAMES[group.level] || group.level} ({group.section.replace(/[()]/g, '')})</span></p>
          <p>الأستاذ: <span className="font-black">الزايز محمد الطاهر</span></p>
        </div>
        <div className="space-y-0.5 text-left w-1/2">
          <p>السنة الدراسية: <span className="font-black">{group.academicYear}</span></p>
          <p>الميدان: <span className="font-black">{TERM_MAPPING[group.term]}</span></p>
          <p>الفصل: <span className="font-black">{group.term}</span></p>
        </div>
      </div>

      {/* Competency Full-Width Box */}
      <div className="border-[2.2px] border-black py-2.5 px-5 mb-2.5 font-black text-[13px] bg-white text-center leading-tight shadow-sm">
        الكفاءة الختامية: {curriculum.kafaa}
      </div>

      {/* Criteria Section */}
      <div className="border-[2px] border-black mb-3 relative p-3 pt-4.5 bg-white shadow-sm">
        <div className="absolute -top-4 right-1/2 translate-x-1/2 px-8 bg-white text-[14px] font-black border-x-[2px] border-black h-8 flex items-center">المعاييــــــــــــــــــــــــــــــــــــــــر</div>
        <div className="grid grid-cols-2 text-[11.5px] font-bold gap-x-14 leading-[1.5]">
          <div className="space-y-1.5">
            <p>1- {curriculum.criteria[0]}</p>
            <p>2- {curriculum.criteria[1]}</p>
          </div>
          <div className="space-y-1.5">
            <p>3- {curriculum.criteria[2]}</p>
            <p>4- {curriculum.criteria[3]}</p>
          </div>
        </div>
      </div>
    </div>

    {/* Table */}
    <table className="flex-grow w-full border-collapse">
      <thead>
        <tr className="h-9 bg-white">
          <th rowSpan={2} className="w-[40px] font-black text-[13px] p-0 border-black border-[2px]">رقم</th>
          <th rowSpan={2} className="w-[230px] text-center font-black text-[13px] p-0 border-black border-[2px]">اللقب والاسم</th>
          <th colSpan={4} className="text-[11px] font-black p-0 border-black border-[2px]">المعيار 1</th>
          <th colSpan={4} className="text-[11px] font-black p-0 border-black border-[2px]">المعيار 2</th>
          <th colSpan={4} className="text-[11px] font-black p-0 border-black border-[2px]">المعيار 3</th>
          <th colSpan={4} className="text-[11px] font-black p-0 border-black border-[2px]">المعيار 4</th>
          <th colSpan={4} className="text-[11px] font-black p-0 border-black border-[2px]">الكفاءة الختامية</th>
          <th rowSpan={2} className="w-[130px] font-black text-[12px] p-0 border-black border-[2px]">الملاحظة</th>
        </tr>
        <tr className="h-6 bg-white text-[11px] font-black">
          {Array(5).fill(0).map((_, gIdx) => (
            <React.Fragment key={gIdx}>
              <th className="w-[20px] p-0 border-black border-[2px]">أ</th>
              <th className="w-[20px] p-0 border-black border-[2px]">ب</th>
              <th className="w-[20px] p-0 border-black border-[2px]">ج</th>
              <th className="w-[20px] p-0 border-black border-[2px]">د</th>
            </React.Fragment>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: 35 }).map((_, idx) => {
          const s = group.students[idx];
          return (
            <tr key={idx} className={`h-[6.3mm] ${s?.isExempt ? 'bg-red-50/40' : (idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/10')}`}>
              <td className="font-black text-center text-[12px] p-0 border-black border-[2px]">{idx + 1}</td>
              <td className={`text-right pr-4 font-bold text-[12.5px] p-0 truncate max-w-[230px] border-black border-[2px] ${s?.isExempt ? 'text-red-600 italic opacity-60' : 'text-slate-900'}`}>
                {s?.name || ''}
              </td>
              {s?.isExempt ? (
                 <td colSpan={21} className="text-[11px] text-red-600 font-black italic text-center p-0 border-black border-[2px]">معفي من الممارسة</td>
              ) : (
                <>
                  {Array(20).fill(0).map((_, i) => <td key={i} className="p-0 border-black border-[2px]"></td>)}
                  <td className="text-[9px] font-black text-blue-900 px-1 leading-none text-center truncate border-black border-[2px]">{observations[s?.id] || ''}</td>
                </>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>

    {/* Legend Footer */}
    <div className="mt-2 border-t-[2px] border-black pt-1.5 flex justify-between items-center text-[11px] font-black px-2">
      <div className="flex gap-10">
        <span>أ: تحكم أقصى</span>
        <span>ب: تحكم مقبول</span>
        <span>ج: تحكم جزئي</span>
        <span>د: تحكم محدود</span>
      </div>
      <div className="w-40 border-b border-black border-dashed h-4"></div>
    </div>
  </div>
);

const PerformanceCardPage: React.FC<{ group: GroupData, curriculum: CurriculumConfig, observations: Record<number, string>, settings: PreviewSettings }> = ({ group, curriculum, observations, settings }) => (
  <div 
    className="print-page portrait-page border border-black flex flex-col"
    style={{ 
      paddingTop: `${settings.marginTop}mm`, 
      paddingBottom: `${settings.marginBottom}mm`, 
      paddingLeft: `${settings.marginLeft}mm`, 
      paddingRight: `${settings.marginRight}mm` 
    }}
  >
    <div style={{ marginTop: `${settings.verticalOffset}mm` }}>
      <div className="text-center mb-2">
        <div className="border-[2.5px] border-black inline-block px-12 py-2 rounded-xl bg-slate-50 shadow-sm">
          <h2 className="text-xl font-black tracking-tight">بطاقة تقييم أداء التلاميذ</h2>
        </div>
      </div>

      <div className="flex justify-between text-[12px] font-bold mb-2 px-1">
        <div className="space-y-0.5 text-right w-1/2">
          <p>المؤسسة: <span className="font-black">مدرسة {group.schoolName}</span></p>
          <p>المستوى: <span className="font-black">{LEVEL_NAMES[group.level] || group.level} {group.section}</span></p>
          <p>الأستاذ: <span className="font-black">الزايز محمد الطاهر</span></p>
        </div>
        <div className="space-y-0.5 text-left w-1/2">
          <p>السنة الدراسية: <span className="font-black">{group.academicYear}</span></p>
          <p>الميدان: <span className="font-black">{TERM_MAPPING[group.term]}</span></p>
          <p>الفصل: <span className="font-black">{group.term}</span></p>
        </div>
      </div>

      <div className="border-[1.8px] border-black bg-slate-50 p-2 mb-2 text-center text-[11px] font-black rounded-md italic leading-tight shadow-sm">
        "يتم تقييم التلميذ بشكل مستمر عن طريق رصد دائم للأداء، مع مراعاة الجوانب الانضباطية والتقنية والسلوك الرياضي القويم."
      </div>
    </div>

    <table className="flex-grow mb-2 w-full border-collapse">
      <thead>
        <tr className="h-8 bg-slate-100">
          <th className="w-[50px] font-black text-[11.5px] p-0 border-black border-[2px]">رقم</th>
          <th className="w-[230px] text-right pr-5 font-black text-[11.5px] p-0 border-black border-[2px]">اللقب والاسم</th>
          <th colSpan={3} className="font-black text-[11px] bg-emerald-50 p-0 border-black border-[2px]">الانضباط (5ن)</th>
          <th colSpan={2} className="font-black text-[11px] bg-blue-50 p-0 border-black border-[2px]">التقني (5ن)</th>
          <th className="w-[60px] font-black text-red-600 text-[11.5px] p-0 border-black border-[2px]">العلامة</th>
          <th className="w-[140px] font-black text-[11.5px] p-0 border-black border-[2px]">الملاحظة</th>
        </tr>
        <tr className="h-6 bg-slate-100 text-[10px] font-black">
          <th colSpan={2} className="p-0 border-black border-[2px]"></th>
          <th className="w-14 p-0 border-black border-[2px]">حضور</th>
          <th className="w-14 p-0 border-black border-[2px]">بذلة</th>
          <th className="w-14 p-0 border-black border-[2px]">سلوك</th>
          <th className="w-14 p-0 border-black border-[2px]">مشاركة</th>
          <th className="w-14 p-0 border-black border-[2px]">تنسيق</th>
          <th colSpan={2} className="p-0 border-black border-[2px]"></th>
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: 35 }).map((_, idx) => {
          const s = group.students[idx];
          return (
            <tr key={idx} className={`h-[6.5mm] ${s?.isExempt ? 'bg-red-50/40' : ''}`}>
              <td className="font-black text-center text-[11px] bg-slate-50/50 p-0 border-black border-[2px]">{idx + 1}</td>
              <td className={`text-right pr-5 font-bold text-[12px] p-0 truncate max-w-[230px] border-black border-[2px] ${s?.isExempt ? 'text-red-600 line-through opacity-50' : 'text-slate-900'}`}>{s?.name || ''}</td>
              {s?.isExempt ? (
                <td colSpan={7} className="text-[11px] text-red-600 font-black italic text-center p-0 border-black border-[2px]">تلميذ معفي</td>
              ) : (
                <>
                  <td className="p-0 border-black border-[2px]"></td>
                  <td className="p-0 border-black border-[2px]"></td>
                  <td className="p-0 border-black border-[2px]"></td>
                  <td className="p-0 border-black border-[2px]"></td>
                  <td className="p-0 border-black border-[2px]"></td>
                  <td className="p-0 border-black border-[2px]"></td>
                  <td className="text-[9px] font-black text-blue-900 leading-none px-1 text-center truncate p-0 border-black border-[2px]">{observations[s?.id] || ''}</td>
                </>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>

    <div className="mt-2 flex justify-end pl-12">
      <div className="text-center w-52 p-3 border-2 border-slate-300 rounded-lg bg-slate-50/30">
        <p className="font-black text-[13px] text-slate-800 mb-6 underline underline-offset-4">ختم وإمضاء الأستاذ:</p>
        <div className="h-8"></div>
      </div>
    </div>
  </div>
);

const AttendancePage: React.FC<{ group: GroupData, settings: PreviewSettings }> = ({ group, settings }) => {
  const academicYearMonths = [
    { name: "سبتمبر", weeks: 2 },
    { name: "أكتوبر", weeks: 4 },
    { name: "نوفمبر", weeks: 4 },
    { name: "ديسمبر", weeks: 2 },
    { name: "جانفي", weeks: 4 },
    { name: "فيفري", weeks: 4 },
    { name: "مارس", weeks: 4 },
    { name: "أفريل", weeks: 4 },
    { name: "ماي", weeks: 2 }
  ];

  const totalWeeks = academicYearMonths.reduce((sum, m) => sum + m.weeks, 0);

  return (
    <div 
      className="print-page landscape-page border-[2.5px] border-black flex flex-col"
      style={{ 
        paddingTop: `${settings.marginTop}mm`, 
        paddingBottom: `${settings.marginBottom}mm`, 
        paddingLeft: `${settings.marginLeft}mm`, 
        paddingRight: `${settings.marginRight}mm` 
      }}
    >
      <div 
        className="flex justify-between items-center mb-2 border-b-[3px] border-black pb-3 bg-slate-50 p-4 rounded-t-lg"
        style={{ marginTop: `${settings.verticalOffset}mm` }}
      >
        <div className="text-right text-[11px] font-black leading-tight w-1/4">
          <p>المؤسسة: <span className="text-blue-700">مدرسة {group.schoolName}</span></p>
          <p>الأستاذ: <span className="text-blue-700">الزايز محمد الطاهر</span></p>
        </div>
        
        <div className="text-center w-1/2">
          <h2 className="text-2xl font-black border-[2.5px] border-black px-14 py-1.5 rounded-full bg-white shadow-md">
            سجل المناداة وتتبع الحضور
          </h2>
          <p className="text-[11px] font-black mt-1 tracking-widest text-slate-500 uppercase">الموسم الدراسي: {group.academicYear}</p>
        </div>
        
        <div className="text-left text-[11px] font-black leading-tight w-1/4">
          <p>المستوى: <span className="text-blue-700">{LEVEL_NAMES[group.level] || group.level} {group.section}</span></p>
          <p>المادة: <span className="text-blue-700">تربية بدنية ورياضية</span></p>
        </div>
      </div>

      <div className="overflow-x-visible flex-grow">
        <table className="w-full border-collapse">
          <thead>
            <tr className="h-6 bg-slate-200">
              <th className="w-[35px] font-black text-[11.5px] p-0 border-black border-[2px]" rowSpan={2}>ر</th>
              <th className="w-[240px] text-right pr-4 font-black text-[12px] p-0 border-black border-[2px]" rowSpan={2}>اللقب والاسم الكامل</th>
              {academicYearMonths.map(m => (
                <th key={m.name} className="text-center font-black bg-slate-300 text-[11px] border-x border-black p-0 border-black border-[2px]" colSpan={m.weeks}>
                  {m.name}
                </th>
              ))}
            </tr>
            <tr className="h-5 bg-slate-200 font-black text-[10px]">
              {academicYearMonths.map(m => Array.from({ length: m.weeks }).map((_, i) => (
                <th key={`${m.name}-${i}`} className="w-8 border-x border-slate-400 p-0 border-black border-[1.8px]">أ{i + 1}</th>
              )))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 35 }).map((_, idx) => {
              const s = group.students[idx];
              return (
                <tr key={idx} className={`h-[5.8mm] ${s?.isExempt ? 'bg-red-50/40' : (idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/15')}`}>
                  <td className="font-black text-center text-[11px] bg-slate-100 p-0 border-black border-[1.8px]">{idx + 1}</td>
                  <td className={`text-right pr-4 font-bold text-[12px] p-0 truncate max-w-[240px] border-black border-[1.8px] ${s?.isExempt ? 'text-red-600 line-through opacity-50' : 'text-slate-900'}`}>
                    {s?.name || ''}
                  </td>
                  {s?.isExempt ? (
                    <td colSpan={totalWeeks} className="text-[11px] text-red-600 font-black italic text-center p-0 border-black border-[1.8px]">تلميذ معفي</td>
                  ) : (
                    Array(totalWeeks).fill(0).map((_, weekIdx) => <td key={weekIdx} className="border-x border-slate-200 p-0 border-black border-[1.8px]"></td>)
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend Footer */}
      <div className="mt-2 flex justify-between items-center text-[11px] font-black p-3 bg-slate-900 text-white rounded-xl border border-slate-800 shadow-xl">
        <div className="flex gap-8">
          <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-red-500"></div> غ: غائب</span>
          <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-amber-500"></div> م: متأخر</span>
          <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-blue-500"></div> ب: بدون بدلة</span>
          <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-emerald-500"></div> ض: مريض</span>
          <span className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-slate-400"></div> X: معفي</span>
        </div>
        <div className="text-[13px] font-black flex items-center gap-4">
           <span>توقيع الأستاذ المشرف:</span>
           <div className="w-32 border-b-2 border-white/50 border-dashed"></div>
        </div>
      </div>
    </div>
  );
};

export default App;
