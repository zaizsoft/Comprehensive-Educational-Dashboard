
export enum Stage {
  DATA_IMPORT = 1,
  DOC_SELECTION = 2,
  FINAL_PREVIEW = 3
}

export interface Student {
  id: number;
  name: string;
  isExempt: boolean;
}

export interface GroupData {
  sheetName: string;
  schoolName: string;
  academicYear: string;
  section: string;
  term: string;
  level: string;
  students: Student[];
}

export interface AppState {
  currentGroupIndex: number;
  groups: GroupData[];
  selectedPages: {
    diagnostic: boolean;
    summative: boolean;
    performance: boolean;
    attendance: boolean;
    separator: boolean;
  };
}

export interface CurriculumConfig {
  kafaa: string;
  criteria: string[];
}
