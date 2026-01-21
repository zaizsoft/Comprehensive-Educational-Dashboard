
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
  X
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

  const [aiObservations, setAiObservations] = useState<Record<number, string>>({});
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);

  const extractInfo = (data: any[][], sheetName: string): GroupData => {
    const row4Cells = data[3] || [];
    const row4Text = row4Cells.filter(c => c).join(' ');
    const schoolName = row4Text.replace(/المؤسسة\s*[:：]\s*/g, '').trim() || 'مدرسة غير محددة';

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

      {/* Advanced Full-Screen Preview Overlay */}
      {currentStage === Stage.FINAL_PREVIEW && activeGroup && (
        <div className="preview-overlay no-print">
          <div className="sticky top-0 w-full bg-white border-b px-8 py-5 flex items-center justify-between shadow-2xl z-[110]">
             <div className="flex items-center gap-5">
               <button onClick={() => setCurrentStage(Stage.DOC_SELECTION)} className="p-3 bg-slate-100 rounded-2xl text-slate-700 hover:bg-slate-200 transition-all hover:rotate-90">
                  <X className="w-6 h-6" />
               </button>
               <div>
                 <h3 className="font-black text-slate-900 text-xl tracking-tight">معاينة الوثائق الرسمية</h3>
                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">فوج: {activeGroup.section} • {activeGroup.schoolName}</p>
               </div>
             </div>
             <button onClick={() => window.print()} className="px-10 py-4 bg-blue-600 text-white rounded-2xl font-black flex items-center gap-3 shadow-xl hover:bg-blue-700 transition-all">
                <Printer className="w-5 h-5" /> طباعة النسخة النهائية
             </button>
          </div>

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
              />
            )}

            {state.selectedPages.summative && (
              <AssessmentPage 
                title="تقويم التحصيلي للكفاءة الختامية" 
                group={activeGroup} 
                curriculum={currentCurriculum!} 
                observations={aiObservations} 
              />
            )}

            {state.selectedPages.performance && (
              <PerformanceCardPage 
                group={activeGroup} 
                curriculum={currentCurriculum!} 
                observations={aiObservations} 
              />
            )}

            {state.selectedPages.attendance && (
              <AttendancePage group={activeGroup} />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const AssessmentPage: React.FC<{ title: string, group: GroupData, curriculum: CurriculumConfig, observations: Record<number, string> }> = ({ title, group, curriculum, observations }) => (
  <div className="print-page portrait-page border border-black p-[5mm] flex flex-col">
    <div className="text-center mb-1">
      <div className="border-[2px] border-black px-12 py-1 inline-block rounded-full font-black text-lg bg-white shadow-sm">
        {title}
      </div>
    </div>
    
    <div className="flex justify-between items-start text-[8.5px] font-bold mb-1 px-2">
      <div className="space-y-0.5 text-right w-1/3">
        <p>المؤسسة: <span className="font-black">{group.schoolName}</span></p>
        <p>المستوى: <span className="font-black">{LEVEL_NAMES[group.level] || group.level} {group.section}</span></p>
        <p>الأستاذ: <span className="font-black">الزايز محمد الطاهر</span></p>
      </div>
      <div className="space-y-0.5 text-left w-1/3">
        <p>السنة الدراسية: <span className="font-black">{group.academicYear}</span></p>
        <p>الميدان: <span className="font-black">{TERM_MAPPING[group.term]}</span></p>
        <p>الفصل: <span className="font-black">{group.term}</span></p>
      </div>
    </div>

    <div className="border-[1.5px] border-black p-1 mb-1 font-black text-[9px] bg-slate-50 text-center leading-none">
      <span className="text-blue-800">الكفاءة الختامية:</span> {curriculum.kafaa}
    </div>

    <div className="border-[1.5px] border-black mb-1 relative p-0.5 pt-2.5 bg-white">
      <div className="absolute -top-2 right-1/2 translate-x-1/2 px-2 bg-white text-[8px] font-black border-x border-black">المعاييــــــــــــــــــــــــــــــــــــــــر</div>
      <div className="grid grid-cols-2 text-[8px] font-bold gap-x-4 leading-tight">
        <div className="pr-2 border-l border-black">
          <p>1- {curriculum.criteria[0]}</p>
          <p>2- {curriculum.criteria[1]}</p>
        </div>
        <div className="pr-2">
          <p>3- {curriculum.criteria[2]}</p>
          <p>4- {curriculum.criteria[3]}</p>
        </div>
      </div>
    </div>

    <table className="flex-grow w-full border-collapse">
      <thead>
        <tr className="h-5 bg-white">
          <th rowSpan={2} className="w-[20px] font-black text-[8px] p-0 border-black border-[1px]">رقم</th>
          <th rowSpan={2} className="w-[140px] text-right pr-2 font-black text-[8.5px] p-0 border-black border-[1px]">اللقب والاسم</th>
          {[1, 2, 3, 4].map(i => <th key={i} colSpan={4} className="text-[7.5px] font-black p-0 leading-none border-black border-[1px]">المعيار {i}</th>)}
          <th colSpan={4} className="text-[7.5px] font-black bg-blue-50/20 p-0 border-black border-[1px]">الكفاءة الختامية</th>
          <th rowSpan={2} className="w-[85px] font-black text-[8.5px] p-0 border-black border-[1px]">الملاحظة</th>
        </tr>
        <tr className="h-4 bg-white text-[7.5px] font-black">
          {Array(5).fill(0).map((_, gIdx) => (
            <React.Fragment key={gIdx}>
              {['أ', 'ب', 'ج', 'د'].map(c => <th key={c} className="w-4 p-0 border-black border-[1px]">{c}</th>)}
            </React.Fragment>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: 35 }).map((_, idx) => {
          const s = group.students[idx];
          return (
            <tr key={idx} className={`h-[5.0mm] ${s?.isExempt ? 'bg-red-50/50' : ''}`}>
              <td className="font-black text-center text-[8px] p-0 border-black border-[1px]">{idx + 1}</td>
              <td className={`text-right pr-2 font-bold text-[8.5px] p-0 truncate max-w-[140px] border-black border-[1px] ${s?.isExempt ? 'text-red-600 line-through italic opacity-50' : 'text-slate-900'}`}>
                {s?.name || ''}
              </td>
              {s?.isExempt ? (
                 <td colSpan={21} className="text-[7.5px] text-red-600 font-black italic text-center p-0 border-black border-[1px]">تلميذ معفي من الممارسة</td>
              ) : (
                <>
                  {Array(20).fill(0).map((_, i) => <td key={i} className="p-0 border-black border-[1px]"></td>)}
                  <td className="text-[6.5px] font-black text-blue-800 px-0.5 leading-none text-center truncate border-black border-[1px]">{observations[s?.id] || ''}</td>
                </>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>

    <div className="mt-1 pt-1 flex justify-around text-[8px] font-black border-t-[1.5px] border-black bg-white p-1">
        <span>د = تملك محدود (3/0)</span>
        <span>ج = تملك جزئي (3/1)</span>
        <span>ب = تملك مقبول (3/2)</span>
        <span>أ = تملك أقصى (3/3)</span>
    </div>
  </div>
);

const PerformanceCardPage: React.FC<{ group: GroupData, curriculum: CurriculumConfig, observations: Record<number, string> }> = ({ group, curriculum, observations }) => (
  <div className="print-page portrait-page border border-black p-[5mm] flex flex-col">
    <div className="text-center mb-1">
      <div className="border-[2px] border-black inline-block px-10 py-1 rounded-lg bg-slate-50 shadow-sm">
        <h2 className="text-lg font-black tracking-tight">بطاقة تقييم أداء التلاميذ</h2>
      </div>
    </div>

    <div className="flex justify-between text-[9px] font-bold mb-1 px-1">
      <div className="space-y-0.5 text-right w-1/2">
        <p>المؤسسة: <span className="font-black">{group.schoolName}</span></p>
        <p>المستوى: <span className="font-black">{LEVEL_NAMES[group.level] || group.level} {group.section}</span></p>
        <p>الأستاذ: <span className="font-black">الزايز محمد الطاهر</span></p>
      </div>
      <div className="space-y-0.5 text-left w-1/2">
        <p>السنة الدراسية: <span className="font-black">{group.academicYear}</span></p>
        <p>الميدان: <span className="font-black">{TERM_MAPPING[group.term]}</span></p>
        <p>الفصل: <span className="font-black">{group.term}</span></p>
      </div>
    </div>

    <div className="border-[1.5px] border-black bg-slate-50 p-1 mb-1.5 text-center text-[9px] font-black rounded-md italic leading-tight shadow-sm">
      "يتم تقييم التلميذ بشكل مستمر عن طريق رصد دائم للأداء، مع مراعاة الجوانب الانضباطية والتقنية والسلوك الرياضي القويم."
    </div>

    <table className="flex-grow mb-1 w-full border-collapse">
      <thead>
        <tr className="h-6 bg-slate-100">
          <th className="w-[30px] font-black text-[9px] p-0 border-black border-[1px]">رقم</th>
          <th className="w-[160px] text-right pr-3 font-black text-[9px] p-0 border-black border-[1px]">اللقب والاسم</th>
          <th colSpan={3} className="font-black text-[8px] bg-emerald-50 p-0 border-black border-[1px]">الانضباط (5ن)</th>
          <th colSpan={2} className="font-black text-[8px] bg-blue-50 p-0 border-black border-[1px]">التقني (5ن)</th>
          <th className="w-[45px] font-black text-red-600 text-[9px] p-0 border-black border-[1px]">العلامة</th>
          <th className="w-[90px] font-black text-[9px] p-0 border-black border-[1px]">الملاحظة</th>
        </tr>
        <tr className="h-4 bg-slate-100 text-[7px] font-black">
          <th colSpan={2} className="p-0 border-black border-[1px]"></th>
          <th className="w-10 p-0 border-black border-[1px]">حضور</th>
          <th className="w-10 p-0 border-black border-[1px]">بذلة</th>
          <th className="w-10 p-0 border-black border-[1px]">سلوك</th>
          <th className="w-10 p-0 border-black border-[1px]">مشاركة</th>
          <th className="w-10 p-0 border-black border-[1px]">تنسيق</th>
          <th colSpan={2} className="p-0 border-black border-[1px]"></th>
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: 35 }).map((_, idx) => {
          const s = group.students[idx];
          return (
            <tr key={idx} className={`h-[5.2mm] ${s?.isExempt ? 'bg-red-50/50' : ''}`}>
              <td className="font-black text-center text-[8.5px] bg-slate-50/50 p-0 border-black border-[1px]">{idx + 1}</td>
              <td className={`text-right pr-3 font-bold text-[8.5px] p-0 truncate max-w-[160px] border-black border-[1px] ${s?.isExempt ? 'text-red-600 line-through opacity-50' : 'text-slate-900'}`}>{s?.name || ''}</td>
              {s?.isExempt ? (
                <td colSpan={7} className="text-[8px] text-red-600 font-black italic text-center p-0 border-black border-[1px]">تلميذ معفي</td>
              ) : (
                <>
                  <td className="p-0 border-black border-[1px]"></td>
                  <td className="p-0 border-black border-[1px]"></td>
                  <td className="p-0 border-black border-[1px]"></td>
                  <td className="p-0 border-black border-[1px]"></td>
                  <td className="p-0 border-black border-[1px]"></td>
                  <td className="p-0 border-black border-[1px]"></td>
                  <td className="text-[6.5px] font-black text-blue-900 leading-none px-0.5 text-center truncate p-0 border-black border-[1px]">{observations[s?.id] || ''}</td>
                </>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>

    <div className="mt-0.5 flex justify-end pl-5">
      <div className="text-center w-36 p-1.5 border border-slate-300 rounded-md bg-slate-50/20">
        <p className="font-black text-[10px] text-slate-800 mb-3 underline underline-offset-1">ختم وإمضاء الأستاذ:</p>
        <div className="h-5"></div>
      </div>
    </div>
  </div>
);

const AttendancePage: React.FC<{ group: GroupData }> = ({ group }) => {
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
    <div className="print-page landscape-page border-[1.5px] border-black p-[3mm] flex flex-col">
      <div className="flex justify-between items-center mb-1 border-b-2 border-black pb-1 bg-slate-50 p-2 rounded-t-md">
        <div className="text-right text-[8.5px] font-black leading-tight w-1/4">
          <p>المؤسسة: <span className="text-blue-700">{group.schoolName}</span></p>
          <p>الأستاذ: <span className="text-blue-700">الزايز محمد الطاهر</span></p>
        </div>
        
        <div className="text-center w-1/2">
          <h2 className="text-base font-black border-[1.5px] border-black px-10 py-0.5 rounded-full bg-white shadow-sm">
            سجل المناداة وتتبع الحضور
          </h2>
          <p className="text-[8.5px] font-black mt-0.2 tracking-widest text-slate-500 uppercase">الموسم الدراسي: {group.academicYear}</p>
        </div>
        
        <div className="text-left text-[8.5px] font-black leading-tight w-1/4">
          <p>المستوى: <span className="text-blue-700">{LEVEL_NAMES[group.level] || group.level} {group.section}</span></p>
          <p>المادة: <span className="text-blue-700">تربية بدنية ورياضية</span></p>
        </div>
      </div>

      <div className="overflow-x-visible">
        <table className="flex-grow w-full border-collapse">
          <thead>
            <tr className="h-4 bg-slate-200">
              <th className="w-[20px] font-black text-[8.5px] p-0 border-black border-[1px]" rowSpan={2}>ر</th>
              <th className="w-[150px] text-right pr-2 font-black text-[9px] p-0 border-black border-[1px]" rowSpan={2}>اللقب والاسم الكامل</th>
              {academicYearMonths.map(m => (
                <th key={m.name} className="text-center font-black bg-slate-300 text-[8px] border-x border-black p-0 border-black border-[1px]" colSpan={m.weeks}>
                  {m.name}
                </th>
              ))}
            </tr>
            <tr className="h-3.5 bg-slate-200 font-black text-[7px]">
              {academicYearMonths.map(m => Array.from({ length: m.weeks }).map((_, i) => (
                <th key={`${m.name}-${i}`} className="w-5.5 border-x border-slate-400 p-0 border-black border-[1px]">أ{i + 1}</th>
              )))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 35 }).map((_, idx) => {
              const s = group.students[idx];
              return (
                <tr key={idx} className={`h-[4.6mm] ${s?.isExempt ? 'bg-red-50/50' : (idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/10')}`}>
                  <td className="font-black text-center text-[7.5px] bg-slate-100 p-0 border-black border-[1px]">{idx + 1}</td>
                  <td className={`text-right pr-2 font-bold text-[8.5px] p-0 truncate max-w-[150px] border-black border-[1px] ${s?.isExempt ? 'text-red-600 line-through opacity-50' : 'text-slate-900'}`}>
                    {s?.name || ''}
                  </td>
                  {s?.isExempt ? (
                    <td colSpan={totalWeeks} className="text-[7.5px] text-red-600 font-black italic text-center p-0 border-black border-[1px]">تلميذ معفي</td>
                  ) : (
                    Array(totalWeeks).fill(0).map((_, weekIdx) => <td key={weekIdx} className="border-x border-slate-200 p-0 border-black border-[1px]"></td>)
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-1 flex justify-between items-center text-[7.5px] font-black p-1 bg-slate-900 text-white rounded border border-slate-800">
        <div className="flex gap-3">
          <span>غ: غائب</span>
          <span>م: متأخر</span>
          <span>ب: بدون بدلة</span>
          <span>ض: مريض</span>
          <span>X: معفي</span>
        </div>
        <div className="text-[10px] font-black flex items-center gap-1">
           <span>توقيع الأستاذ:</span>
           <div className="w-20 border-b border-white border-dashed"></div>
        </div>
      </div>
    </div>
  );
};

export default App;
