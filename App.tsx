
import React, { useState, useMemo } from 'react';
import { 
  Building2, 
  Users, 
  User,
  Printer, 
  ChevronRight, 
  ChevronLeft, 
  FileCheck, 
  Table as TableIcon, 
  FileText, 
  Layout, 
  CheckCircle2, 
  Trash2,
  Zap,
  UploadCloud,
  Layers,
  Info,
  ChevronDown,
  Eye
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Stage, Student, AppState, GroupData, CurriculumConfig } from './types.ts';
import { LEVELS_CONFIG, TERM_MAPPING } from './constants.ts';
import { geminiService } from './services/geminiService.ts';

const LEVEL_NAMES: Record<string, string> = {
  "1": "السنة الأولى",
  "2": "السنة الثانية",
  "3": "السنة الثالثة",
  "4": "السنة الرابعة",
  "5": "السنة الخامسة"
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
    const academicYear = academicYearMatch ? academicYearMatch[0] : '2025-2026';
    
    let term = 'الفصل الأول';
    if (row5Text.includes('الثاني')) term = 'الفصل الثاني';
    if (row5Text.includes('الثالث')) term = 'الفصل الثالث';
    
    let section = sheetName; 
    if (row5Text.includes('الفوج التربوي')) {
      const parts = row5Text.split('الفوج التربوي');
      const afterFoj = parts[1]?.split('مادة')[0] || '';
      let rawSection = afterFoj.replace(/[:：]/g, '').trim() || sheetName;
      
      if (rawSection.endsWith('1')) {
        section = rawSection.slice(0, -1).trim() + ' أ';
      } else if (rawSection.endsWith('2')) {
        section = rawSection.slice(0, -1).trim() + ' ب';
      } else {
        section = rawSection;
      }
    } else if (row5Text.includes('الفوج:')) {
      section = row5Text.split('الفوج:')[1]?.trim().split(/\s+/)[0] || sheetName;
    }
    
    let level = '2';
    const numMatch = section.match(/[1-5]/);
    if (numMatch) {
      level = numMatch[0];
    } else {
      for (const [key, val] of Object.entries(ARABIC_LEVEL_TO_NUM)) {
        if (section.includes(key)) {
          level = val;
          break;
        }
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
    <div className="min-h-screen no-print-bg-none overflow-x-hidden bg-[#F1F5F9]">
      <div className="no-print bg-white/80 backdrop-blur-md border-b sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto p-4 sm:p-6">
          <header className="flex flex-col lg:flex-row items-center justify-between mb-8 gap-6">
            <div className="flex items-center gap-5">
              <div className="p-4 bg-gradient-to-tr from-blue-700 to-indigo-600 rounded-[1.5rem] text-white shadow-xl shadow-blue-100">
                <Layout className="w-10 h-10" />
              </div>
              <div className="text-right">
                <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-none mb-2">أداة الإدارة التربوية الذكية</h1>
                <div className="flex items-center gap-2 text-slate-500 font-bold text-sm">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                  نظام استخراج آلي لبيانات المؤسسة والأفواج
                </div>
              </div>
            </div>
            
            <nav className="flex items-center gap-3 bg-slate-100/50 p-2 rounded-3xl border border-slate-200">
              {[1, 2, 3].map((s) => (
                <button
                  key={s}
                  onClick={() => state.groups.length > 0 && setCurrentStage(s as Stage)}
                  className={`px-8 py-3 rounded-2xl text-sm font-black transition-all flex items-center gap-3 ${
                    currentStage === s 
                      ? 'bg-white text-blue-700 shadow-xl shadow-blue-50 border border-blue-100' 
                      : 'text-slate-400 hover:text-slate-600 hover:bg-slate-200/50'
                  }`}
                >
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] ${currentStage === s ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-500'}`}>{s}</span>
                  {s === 1 ? 'البيانات والأفواج' : s === 2 ? 'تخصيص الوثيقة' : 'المعاينة والطباعة'}
                </button>
              ))}
            </nav>
          </header>

          <main className="bg-white rounded-[3rem] p-6 sm:p-12 border border-slate-200 shadow-2xl shadow-slate-200/50 min-h-[500px]">
            {currentStage === Stage.DATA_IMPORT && (
              <div className="space-y-10 animate-in fade-in zoom-in-95 duration-500">
                {!state.groups.length ? (
                  <div className="max-w-3xl mx-auto text-center space-y-8">
                    <div className="space-y-4">
                      <h2 className="text-3xl font-black text-slate-800">ابدأ برفع ملف الرقمنة</h2>
                      <p className="text-slate-500 font-bold">يقوم النظام باستخراج اسم المؤسسة من السطر 4، وباقي البيانات من السطر 5 تلقائياً.</p>
                    </div>
                    <label className="flex flex-col items-center justify-center p-24 bg-blue-50/30 border-4 border-dashed border-blue-100 rounded-[4rem] cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-all group relative overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-br from-blue-100/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                      <input type="file" className="hidden" accept=".xlsx,.xls" onChange={handleExcelImport} />
                      <UploadCloud className="w-24 h-24 text-blue-300 group-hover:text-blue-600 group-hover:scale-110 transition-all mb-8 relative z-10" />
                      <span className="text-2xl font-black text-slate-700 relative z-10">اختر ملف الإكسيل للمؤسسة</span>
                    </label>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 xl:grid-cols-12 gap-12">
                    <div className="xl:col-span-5 space-y-8">
                      <div className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-8">
                        <div className="flex items-center justify-between border-b border-slate-200 pb-6">
                          <h3 className="text-xl font-black text-blue-900 flex items-center gap-3">
                            <Info className="w-6 h-6" /> تفاصيل المؤسسة المستخرجة
                          </h3>
                          <button onClick={() => setState(prev => ({ ...prev, groups: [] }))} className="text-red-500 p-3 hover:bg-red-50 rounded-2xl transition-all border border-transparent hover:border-red-100">
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                        
                        <div className="space-y-6">
                          <div className="p-6 bg-white rounded-3xl border border-slate-100 shadow-sm group">
                            <p className="text-[10px] font-black text-blue-400 uppercase mb-2 tracking-widest">المؤسسة التعليمية (السطر 4)</p>
                            <p className="text-xl font-black text-slate-800">{activeGroup?.schoolName}</p>
                          </div>

                          <div className="grid grid-cols-2 gap-6">
                            <div className="p-6 bg-white rounded-3xl border border-slate-100 shadow-sm">
                              <p className="text-[10px] font-black text-emerald-400 uppercase mb-2 tracking-widest">السنة الدراسية</p>
                              <p className="text-lg font-black text-slate-800">{activeGroup?.academicYear}</p>
                            </div>
                            <div className="p-6 bg-white rounded-3xl border border-slate-100 shadow-sm">
                              <p className="text-[10px] font-black text-amber-400 uppercase mb-2 tracking-widest">الفصل الدراسي</p>
                              <p className="text-lg font-black text-slate-800">{activeGroup?.term}</p>
                            </div>
                          </div>

                          <div className="space-y-4 pt-4">
                            <label className="text-sm font-black text-slate-600 flex items-center gap-2 pr-2">
                              <Layers className="w-5 h-5 text-blue-600" /> الفوج التربوي الحالي:
                            </label>
                            <div className="relative">
                              <select 
                                value={state.currentGroupIndex}
                                onChange={(e) => setState(prev => ({ ...prev, currentGroupIndex: Number(e.target.value) }))}
                                className="w-full px-6 py-6 bg-blue-600 text-white border-none rounded-[2rem] font-black text-xl outline-none shadow-2xl shadow-blue-200 appearance-none cursor-pointer hover:bg-blue-700 transition-all text-center leading-[1.5]"
                                style={{ direction: 'rtl' }}
                              >
                                {state.groups.map((g, idx) => (
                                  <option key={idx} value={idx} className="bg-white text-slate-800 py-2">
                                    {g.section} ({g.students.length} تلميذ)
                                  </option>
                                ))}
                              </select>
                              <div className="absolute left-6 top-1/2 -translate-y-1/2 pointer-events-none text-white/80">
                                <ChevronDown className="w-6 h-6" />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="xl:col-span-7 flex flex-col space-y-6">
                      <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full border-2 border-indigo-50">
                        <div className="p-6 bg-indigo-50/50 border-b border-indigo-100 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-500 rounded-xl text-white">
                              <Users className="w-5 h-5" />
                            </div>
                            <h3 className="text-lg font-black text-indigo-900">إدارة تلاميذ {activeGroup?.section}</h3>
                          </div>
                        </div>
                        <div className="flex-1 max-h-[500px] overflow-y-auto p-8 custom-scrollbar bg-slate-50/30">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {activeGroup?.students.map((student, idx) => (
                              <label key={student.id} className={`flex items-center justify-between p-5 rounded-2xl border-2 transition-all cursor-pointer group ${student.isExempt ? 'bg-red-50 border-red-200 shadow-inner' : 'bg-white border-slate-100 hover:border-indigo-400 hover:shadow-lg'}`}>
                                <div className="flex items-center gap-4">
                                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black ${student.isExempt ? 'bg-red-200 text-red-800' : 'bg-slate-100 text-slate-500'}`}>{idx + 1}</span>
                                  <span className={`text-sm font-black ${student.isExempt ? 'text-red-700 line-through opacity-70' : 'text-slate-800'}`}>{student.name}</span>
                                </div>
                                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${student.isExempt ? 'bg-red-500 border-red-500' : 'border-slate-200'}`}>
                                  {student.isExempt && <CheckCircle2 className="w-4 h-4 text-white" />}
                                  <input type="checkbox" className="hidden" checked={student.isExempt} onChange={() => toggleExempt(student.id)} />
                                </div>
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {currentStage === Stage.DOC_SELECTION && (
              <div className="space-y-12 animate-in slide-in-from-left-6 duration-500">
                <div className="text-center max-w-3xl mx-auto space-y-4">
                  <h2 className="text-4xl font-black text-slate-900">صب البيانات في الوثائق</h2>
                  <p className="text-lg text-slate-500 font-bold">بيانات الفوج <span className="text-blue-600 underline font-black">{activeGroup?.section}</span> جاهزة. اختر القالب المطلوب:</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {[
                    { id: 'diagnostic', label: 'التقويم التشخيصي', icon: <FileCheck className="w-10 h-10" />, color: 'blue', desc: 'لتقييم المستوى الأولي للتلاميذ' },
                    { id: 'summative', label: 'التقويم التحصيلي', icon: <TableIcon className="w-10 h-10" />, color: 'indigo', desc: 'رصد النتائج النهائية للفصل' },
                    { id: 'performance', label: 'بطاقة أداء التلميذ', icon: <User className="w-10 h-10" />, color: 'purple', desc: 'متابعة شاملة للأداء البدني' },
                    { id: 'attendance', label: 'سجل المناداة وتتبع الغياب', icon: <Users className="w-10 h-10" />, color: 'emerald', desc: 'تنظيم الحضور والحصص الأسبوعية' },
                    { id: 'separator', label: 'ورقة فاصلة للفصل', icon: <FileText className="w-10 h-10" />, color: 'amber', desc: 'لتنظيم الملف الورقي للأستاذ' },
                  ].map(doc => (
                    <button key={doc.id} onClick={() => setState(prev => ({ ...prev, selectedPages: { ...prev.selectedPages, [doc.id]: !prev.selectedPages[doc.id as keyof typeof prev.selectedPages] } }))} className={`relative p-10 rounded-[3rem] border-4 transition-all flex flex-col items-center gap-6 group text-center ${state.selectedPages[doc.id as keyof typeof state.selectedPages] ? `border-${doc.color}-500 bg-${doc.color}-50/30 shadow-2xl scale-[1.03]` : 'border-white bg-white hover:border-slate-200 shadow-lg'}`}>
                      <div className={`p-6 rounded-[2rem] transition-all group-hover:rotate-6 ${state.selectedPages[doc.id as keyof typeof state.selectedPages] ? `bg-${doc.color}-500 text-white` : 'bg-slate-100 text-slate-400'}`}>{doc.icon}</div>
                      <div className="space-y-2">
                        <span className={`text-xl font-black block ${state.selectedPages[doc.id as keyof typeof state.selectedPages] ? 'text-slate-900' : 'text-slate-600'}`}>{doc.label}</span>
                        <p className="text-xs text-slate-400 font-bold leading-relaxed">{doc.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {currentStage === Stage.FINAL_PREVIEW && (
              <div className="space-y-12 animate-in slide-in-from-bottom-8 duration-600 text-center">
                <div className="max-w-4xl mx-auto bg-gradient-to-br from-blue-800 to-indigo-900 rounded-[4rem] p-16 text-white shadow-2xl space-y-10 relative overflow-hidden">
                  <h2 className="text-5xl font-black tracking-tight">جاهز للإصدار النهائي</h2>
                  <p className="text-xl text-blue-100 font-bold max-w-2xl mx-auto">تم دمج بيانات <span className="text-white underline">{activeGroup?.schoolName}</span> للفوج <span className="text-white">{activeGroup?.section}</span> بنجاح.</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-8">
                    <button 
                      onClick={generateAIObservations} 
                      disabled={isGeneratingAi} 
                      className="px-8 py-5 bg-white/10 text-white rounded-3xl font-black text-lg border border-white/30 backdrop-blur-md shadow-2xl transition-all flex items-center justify-center gap-4 disabled:opacity-50"
                    >
                      {isGeneratingAi ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : <Zap className="w-6 h-6 text-yellow-400" />}
                      {isGeneratingAi ? 'جاري التحليل...' : 'توليد ملاحظات Gemini'}
                    </button>
                    
                    <button 
                      onClick={() => window.print()} 
                      className="px-8 py-5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-3xl font-black text-lg shadow-2xl transition-all flex items-center justify-center gap-4"
                    >
                      <FileText className="w-7 h-7" /> تصدير كـ PDF
                    </button>

                    <button 
                      onClick={() => window.print()} 
                      className="px-8 py-5 bg-yellow-400 hover:bg-yellow-500 text-blue-950 rounded-3xl font-black text-lg shadow-2xl transition-all flex items-center justify-center gap-4"
                    >
                      <Printer className="w-7 h-7" /> طباعة الوثائق
                    </button>
                  </div>
                </div>

                <div className="flex flex-col items-center gap-4 text-slate-400 py-10">
                  <ChevronLeft className="w-8 h-8 rotate-90 animate-bounce" />
                  <p className="text-sm font-black italic">معاينة الوثائق المرتبة في الأسفل (A4 Portrait View)</p>
                </div>
              </div>
            )}
          </main>

          <footer className="mt-12 flex flex-col sm:flex-row justify-between items-center no-print px-6 gap-6">
            <button onClick={() => setCurrentStage(prev => Math.max(prev - 1, 1))} disabled={currentStage === 1} className="w-full sm:w-auto flex items-center justify-center gap-4 px-10 py-5 bg-white border-2 border-slate-200 rounded-[2rem] font-black text-slate-500 hover:bg-slate-50 transition-all disabled:opacity-30 shadow-sm">
              <ChevronRight className="w-6 h-6" /> المرحلة السابقة
            </button>
            <button onClick={() => setCurrentStage(prev => Math.min(prev + 1, 3))} disabled={currentStage === 3 || state.groups.length === 0} className="w-full sm:w-auto flex items-center justify-center gap-4 px-14 py-5 bg-blue-600 text-white rounded-[2rem] font-black hover:bg-blue-700 transition-all shadow-2xl disabled:opacity-30">
              الاستمرار للمرحلة التالية <ChevronLeft className="w-6 h-6" />
            </button>
          </footer>
        </div>
      </div>

      <div className={`preview-engine ${currentStage === Stage.FINAL_PREVIEW ? 'block' : 'hidden'} print:block bg-slate-300/30 sm:py-20 min-h-screen`}>
        <div className="max-w-[210mm] print:max-w-none mx-auto flex flex-col items-center gap-[15mm] print:gap-0">
          
          <div className="no-print mb-8 flex flex-col items-center gap-4">
            <div className="flex items-center gap-3 bg-white px-8 py-3 rounded-full shadow-lg border border-slate-200">
              <Eye className="w-5 h-5 text-blue-600" />
              <span className="font-black text-slate-800">وضع المعاينة النهائية والتحقق (A4)</span>
            </div>
          </div>

          {activeGroup && currentCurriculum && (
            <div className="flex flex-col items-center gap-[10mm] print:gap-0 w-full">
              {state.selectedPages.separator && (
                <div className="print-page w-[210mm] h-[297mm] bg-white p-12 flex flex-col items-center justify-center shadow-xl overflow-hidden relative border border-slate-300 box-border">
                  <div className="border-[20px] border-double border-slate-900 p-20 w-full h-full flex flex-col items-center justify-center space-y-24">
                      <div className="border-8 border-slate-900 px-16 py-8 rounded-[3rem] bg-slate-50 shadow-xl">
                        <h1 className="text-8xl font-black text-slate-900">{activeGroup.term}</h1>
                      </div>
                      <div className="text-center space-y-6">
                        <h2 className="text-5xl font-black text-slate-800">دفتر متابعة التقويم التربوي</h2>
                        <div className="bg-slate-900 text-white px-12 py-5 rounded-3xl text-3xl font-bold inline-block shadow-lg">الميدان: {TERM_MAPPING[activeGroup.term]}</div>
                      </div>
                      <div className="text-3xl font-black text-slate-400 border-t-2 border-slate-100 pt-12 w-full text-center">موسم: {activeGroup.academicYear}</div>
                  </div>
                </div>
              )}
              {state.selectedPages.diagnostic && <AssessmentPage title="تقويم التشخيصي للكفاءة الختامية" group={activeGroup} curriculum={currentCurriculum} observations={aiObservations} />}
              {state.selectedPages.summative && <AssessmentPage title="تقويم التحصيلي للكفاءة الختامية" group={activeGroup} curriculum={currentCurriculum} observations={aiObservations} />}
              {state.selectedPages.performance && <PerformanceCardPage group={activeGroup} curriculum={currentCurriculum} observations={aiObservations} />}
              {state.selectedPages.attendance && <AttendancePage group={activeGroup} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const AssessmentPage: React.FC<{ title: string, group: GroupData, curriculum: CurriculumConfig, observations: Record<number, string> }> = ({ title, group, curriculum, observations }) => (
  <div className="print-page w-[210mm] h-[297mm] bg-white p-[2mm_10mm_5mm_10mm] shadow-xl border border-black flex flex-col text-center box-border overflow-hidden">
    <div className="border-[2px] border-black px-[40px] py-[6px] inline-block rounded-full mb-[8px] font-black text-[18px] mx-auto bg-white">
      {title}
    </div>
    
    <div className="flex justify-between text-[11px] font-bold mb-[6px] text-right">
      <div className="space-y-0.5">
        <p>المؤسسة: <strong>{group.schoolName}</strong></p>
        <p>المستوى: <strong>{LEVEL_NAMES[group.level] || group.level} ({group.section})</strong></p>
        <p>الأستاذ: <strong>الزايز محمد الطاهر</strong></p>
      </div>
      <div className="space-y-0.5 text-left">
        <p>السنة الدراسية: <strong>{group.academicYear}</strong></p>
        <p>الميدان: <strong>{TERM_MAPPING[group.term]}</strong></p>
        <p>الفصل: <strong>{group.term}</strong></p>
      </div>
    </div>

    <div className="border-[2.5px] border-black p-[5px] mb-[6px] font-black text-[11px] bg-white text-right">
      الكفاءة الختامية: {curriculum.kafaa}
    </div>

    <div className="border-[2.5px] border-black mb-[6px] text-right">
      <div className="border-b-[2px] border-black p-[2px] text-center font-black text-[11px] bg-[#f1f1f1]">
        المعاييريـــــــــــــــــــــــــــــــــة
      </div>
      <div className="grid grid-cols-2 text-[10px] font-bold">
        <div className="p-[4px] border-l-[1.5px] border-black space-y-0.5">
          <p>1- اختيار الوضعيات و تنقلات المناسبة للموقف</p>
          <p>2- التنفيذ السليم للوضعيات و التنقلات المختارة</p>
        </div>
        <div className="p-[4px] space-y-0.5">
          <p>3- الانتقال السلس من حركة لأخرى و في الوقت المناسب</p>
          <p>4- تنسيق جملة من الحركات يطلبها الموقف</p>
        </div>
      </div>
    </div>

    <table className="w-full border-collapse border-[1.5px] border-black text-[9px]">
      <thead>
        <tr className="h-[22px]">
          <th rowSpan={2} className="border-[1.5px] border-black w-[25px] font-bold bg-[#f8fafc]">ر</th>
          <th rowSpan={2} className="border-[1.5px] border-black w-[150px] text-right pr-2 font-bold bg-[#f8fafc]">اللقب والاسم</th>
          {[1, 2, 3, 4].map(i => <th key={i} colSpan={4} className="border-[1.5px] border-black font-bold bg-[#f8fafc]">المعيار {i}</th>)}
          <th colSpan={4} className="border-[1.5px] border-black font-bold bg-[#f8fafc]">الكفاءة الختامية</th>
          <th rowSpan={2} className="border-[1.5px] border-black w-[80px] font-bold bg-[#f8fafc]">الملاحظة</th>
        </tr>
        <tr className="h-[18px]">
          {Array(5).fill(0).map((_, groupIdx) => (
            <React.Fragment key={groupIdx}>
              {['أ', 'ب', 'ج', 'د'].map(c => <th key={c} className="border-[1.5px] border-black w-[18px] font-bold bg-[#f8fafc]">{c}</th>)}
            </React.Fragment>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: 35 }).map((_, idx) => {
          const s = group.students[idx];
          return (
            <tr key={idx} className="h-[5.8mm] border-b border-black">
              <td className="border-x border-black font-bold text-center">{idx + 1}</td>
              <td className="border-x border-black text-right pr-2 font-black overflow-hidden truncate">{s?.name || ''}</td>
              {Array(20).fill(0).map((_, i) => <td key={i} className="border-x border-black"></td>)}
              <td className="border-x border-black text-[7px] font-bold text-blue-800 leading-none truncate px-1">
                {observations[s?.id] || ''}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>

    <div className="mt-auto pt-[4px] flex justify-around text-[10px] font-bold border-t-[1.5px] border-black">
        <span>د = تملك محدود</span>
        <span>ج = تملك جزئي</span>
        <span>ب = تملك مقبول</span>
        <span>أ = تملك أقصى</span>
    </div>
  </div>
);

const PerformanceCardPage: React.FC<{ group: GroupData, curriculum: CurriculumConfig, observations: Record<number, string> }> = ({ group, curriculum, observations }) => (
  <div className="print-page w-[210mm] h-[297mm] bg-white p-[2mm_10mm_5mm_10mm] shadow-xl border border-black flex flex-col text-center relative box-border overflow-hidden">
    <div className="border-[3px] border-black inline-block px-[50px] py-[6px] rounded-[15px] mb-[10px] bg-white mx-auto">
      <h2 className="text-[20px] font-black">بطاقة تقييم أداء التلاميذ</h2>
    </div>

    <div className="flex justify-between text-[11px] font-bold mb-[10px] text-right">
      <div className="space-y-0.5">
        <p>المؤسسة: <strong>{group.schoolName}</strong></p>
        <p>المستوى: <strong>{LEVEL_NAMES[group.level] || group.level} ({group.section})</strong></p>
        <p>الأستاذ: <strong>الزايز محمد الطاهر</strong></p>
      </div>
      <div className="space-y-0.5 text-left">
        <p>السنة الدراسية: <strong>{group.academicYear}</strong></p>
        <p>الميدان: <strong>{TERM_MAPPING[group.term]}</strong></p>
        <p>الفصل: <strong>{group.term}</strong></p>
      </div>
    </div>

    <div className="border-y-[2px] border-black py-[6px] px-[12px] mb-[10px] font-bold text-[9px] leading-none bg-[#f8fafc] text-right whitespace-nowrap overflow-hidden">
      يتم تقييم التلميذ بشكل مستمر عن طريق رصد دائم للأداء من أول يوم في الفصل إلى حصة التقويم التحصيلي، مع مراعاة الجوانب الانضباطية والتقنية.
    </div>

    <table className="w-full border-collapse border-[1.5px] border-black table-fixed mb-auto text-[10px]">
      <thead>
        <tr className="h-[28px] bg-[#f1f5f9]">
          <th className="border-[1.5px] border-black w-[30px] font-black">رقم</th>
          <th className="border-[1.5px] border-black w-[160px] text-right pr-2 font-black">اللقب والاسم</th>
          <th colSpan={3} className="border-[1.5px] border-black font-black">الالتزام بالتعليمات</th>
          <th colSpan={2} className="border-[1.5px] border-black font-black">الأداء الرياضي</th>
          <th className="border-[1.5px] border-black w-[40px] font-black">العلامة</th>
          <th className="border-[1.5px] border-black w-[100px] font-black">الملاحظة</th>
        </tr>
        <tr className="h-[20px] bg-[#f1f5f9] text-[9px] font-bold">
          <th className="border-black border-[1.5px]" colSpan={2}></th>
          <th className="border-[1.5px] border-black">الحضور (1)</th>
          <th className="border-[1.5px] border-black">اللباس (1)</th>
          <th className="border-[1.5px] border-black">السلوك (3)</th>
          <th className="border-[1.5px] border-black">المشاركة (3)</th>
          <th className="border-[1.5px] border-black">التنسيق (2)</th>
          <th className="border-black border-[1.5px]" colSpan={2}></th>
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: 35 }).map((_, idx) => {
          const s = group.students[idx];
          return (
            <tr key={idx} className="h-[6.2mm] border-b border-black">
              <td className="border-x border-black font-bold text-center">{idx + 1}</td>
              <td className="border-x border-black text-right pr-2 font-bold overflow-hidden truncate">{s?.name || ''}</td>
              <td className="border-x border-black"></td>
              <td className="border-x border-black"></td>
              <td className="border-x border-black"></td>
              <td className="border-x border-black"></td>
              <td className="border-x border-black"></td>
              <td className="border-x border-black"></td>
              <td className="border-x border-black text-[8px] font-bold text-blue-800 leading-none truncate px-1">
                {observations[s?.id] || ''}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>

    <div className="mt-4 flex justify-end pl-8 pb-4">
      <div className="text-center">
        <p className="font-black text-[12px]">إمضاء الأستاذ:</p>
        <div className="mt-8 border-b-[2px] border-black w-[180px] border-dashed"></div>
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
    <div className="print-page landscape-page w-[297mm] h-[210mm] bg-white p-[5mm] shadow-xl border border-black flex flex-col overflow-hidden box-border">
      <div className="flex justify-between items-center mb-[5px] border-b-[2px] border-black pb-[5px]">
        <div className="info-box text-right text-[11px] font-bold leading-[1.4]">
          <p>المؤسسة: <strong>{group.schoolName}</strong></p>
          <p>الأستاذ: <strong>الزايز محمد الطاهر</strong></p>
        </div>
        
        <div className="text-center">
          <h2 className="text-[20px] font-black border-[1.5px] border-black px-[30px] py-[2px] rounded-full bg-[#f1f5f9] mx-auto inline-block">
            سجل المناداة وتتبع الغيابات
          </h2>
          <p className="text-[9px] font-bold mt-1">الموسم الدراسي: {group.academicYear}</p>
        </div>
        
        <div className="info-box text-left text-[11px] font-bold leading-[1.4]">
          <p>المستوى: <strong>{LEVEL_NAMES[group.level] || group.level} ({group.section})</strong></p>
          <p>المادة: <strong>تربية بدنية ورياضية</strong></p>
        </div>
      </div>

      <table className="w-full border-collapse border-[1px] border-black table-fixed">
        <thead>
          <tr className="h-[22px] bg-[#f1f5f9]">
            <th className="border-[1px] border-black w-[25px] font-black text-[9px]" rowSpan={2}>ر</th>
            <th className="border-[1px] border-black w-[160px] text-right pr-2 font-black text-[10px]" rowSpan={2}>اللقب والاسم</th>
            {academicYearMonths.map(m => (
              <th key={m.name} className="border-[1px] border-black text-center font-black bg-[#e2e8f0] text-[9px]" colSpan={m.weeks}>
                {m.name}
              </th>
            ))}
          </tr>
          <tr className="h-[18px] bg-[#f1f5f9] font-black text-[8px]">
            {academicYearMonths.map(m => Array.from({ length: m.weeks }).map((_, i) => (
              <th key={`${m.name}-${i}`} className="border-[1px] border-black">أ{i + 1}</th>
            )))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 35 }).map((_, idx) => {
            const s = group.students[idx];
            return (
              <tr key={idx} className="h-[4.4mm] border-b border-black">
                <td className="border-x border-black font-black text-center text-[9px] bg-[#f8fafc]">{idx + 1}</td>
                <td className="border-x border-black text-right pr-2 font-bold text-[10px] overflow-hidden truncate">{s?.name || ''}</td>
                {Array(totalWeeks).fill(0).map((_, weekIdx) => (
                  <td key={weekIdx} className="border-x border-black text-center font-black text-red-600"></td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="mt-auto flex justify-between items-center text-[10px] font-bold p-[5px_10px] bg-[#f8fafc] border-[1.5px] border-black rounded-[5px]">
        <span>(غ): غائب | (م): متأخر | (ب): بدون بدلة | (ض): مريض | (X): معفي | حاضر: خانة فارغة</span>
        <span>توقيع الأستاذ: ............................</span>
      </div>
    </div>
  );
};

export default App;
