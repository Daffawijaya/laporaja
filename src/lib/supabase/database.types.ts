export type Role = "superadmin" | "user";
export type KeteranganTipe = "text" | "image";
export type ReviewStatus = "approved" | "revision";

export type BidangRow = {
  id: string;
  nama: string;
  created_at: string;
  updated_at: string;
};

export type ProfileRow = {
  id: string;
  username: string;
  nama: string;
  role: Role;
  bidang_id: string | null;
  /** Path foto profil di Storage, null bila belum ada. */
  foto: string | null;
  /** Rujukan gambar tanda tangan milik user, null bila belum ada. */
  ttd: string | null;
  created_at: string;
  updated_at: string;
};

export type UserSubBidangRow = {
  id: string;
  user_id: string;
  nama: string;
  created_at: string;
  updated_at: string;
};

export type KegiatanRow = {
  id: string;
  user_id: string;
  tanggal: string;
  nama_kegiatan: string;
  created_at: string;
  updated_at: string;
};

export type KeteranganKegiatanRow = {
  id: string;
  kegiatan_id: string;
  tipe: KeteranganTipe;
  isi_text: string | null;
  image_url: string | null;
  urutan: number;
  created_at: string;
  updated_at: string;
};

export type ReviewRow = {
  id: string;
  kegiatan_id: string;
  status: ReviewStatus;
  catatan: string | null;
  created_at: string;
  updated_at: string;
};

export type MonthlyReviewStatus = "menunggu" | "selesai" | "revision" | "approved";

export type MonthlyReviewRow = {
  id: string;
  user_id: string;
  tahun: number;
  bulan: number;
  rekomendasi: string | null;
  status: MonthlyReviewStatus;
  catatan: string | null;
  created_at: string;
  updated_at: string;
};

export type IndikatorRow = {
  id: string;
  nama: string;
  target_bulanan: number | null;
  bidang_id: string | null;
  user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type KegiatanIndikatorRow = {
  kegiatan_id: string;
  indikator_id: string;
  created_at: string;
};

export type LaporanTambahanRow = {
  id: string;
  judul: string;
  deskripsi: string | null;
  format: LaporanFormat;
  urutan: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type LaporanTambahanBidangRow = {
  laporan_id: string;
  bidang_id: string;
};

export type KolomTipe = "text" | "textarea" | "date" | "number" | "image";

/** Bentuk isian laporan tambahan: tabel (baris-baris kolom), esai (satu teks panjang), atau judul (pembatas tanpa isian). */
export type LaporanFormat = "tabel" | "esai" | "judul" | "indikator";

export type LaporanTambahanKolomRow = {
  id: string;
  laporan_id: string;
  label: string;
  tipe: KolomTipe;
  wajib: boolean;
  urutan: number;
  /** Satuan isian (dipakai format indikator), "" bila tanpa satuan. */
  satuan: string;
  created_at: string;
  updated_at: string;
};

export type LaporanTambahanBarisRow = {
  id: string;
  laporan_id: string;
  user_id: string;
  bulan: number;
  tahun: number;
  urutan: number;
  created_at: string;
  updated_at: string;
};

export type LaporanTambahanNilaiRow = {
  baris_id: string;
  kolom_id: string;
  nilai: string;
};

/** Baris yang ditandai perlu revisi (ada baris = perlu revisi). */
export type RevisiBarisRow = {
  baris_id: string;
  catatan: string;
  created_at: string;
  updated_at: string;
};

export type SectionKode = "kegiatan" | "rekomendasi" | "info" | "indikator";

export type LaporanSectionRow = {
  kode: SectionKode;
  judul: string;
  urutan: number;
};

export type LaporanSectionBidangRow = {
  kode: string;
  bidang_id: string;
};

export type PengaturanRow = {
  kunci: string;
  nilai: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      bidang: {
        Row: BidangRow;
        Insert: Pick<BidangRow, "nama"> & Partial<Pick<BidangRow, "id" | "created_at" | "updated_at">>;
        Update: Partial<Pick<BidangRow, "nama">>;
        Relationships: [];
      };
      profiles: {
        Row: ProfileRow;
        Insert: Pick<ProfileRow, "id" | "username" | "nama"> &
          Partial<Pick<ProfileRow, "role" | "bidang_id" | "created_at" | "updated_at">>;
        Update: Partial<Pick<ProfileRow, "nama" | "username" | "role" | "bidang_id" | "foto" | "ttd">>;
        Relationships: [];
      };
      user_sub_bidang: {
        Row: UserSubBidangRow;
        Insert: Pick<UserSubBidangRow, "user_id" | "nama"> &
          Partial<Pick<UserSubBidangRow, "id" | "created_at" | "updated_at">>;
        Update: Partial<Pick<UserSubBidangRow, "nama">>;
        Relationships: [];
      };
      kegiatan: {
        Row: KegiatanRow;
        Insert: Pick<KegiatanRow, "user_id" | "tanggal" | "nama_kegiatan"> &
          Partial<Pick<KegiatanRow, "id" | "created_at" | "updated_at">>;
        Update: Partial<Pick<KegiatanRow, "tanggal" | "nama_kegiatan">>;
        Relationships: [];
      };
      keterangan_kegiatan: {
        Row: KeteranganKegiatanRow;
        Insert: Pick<KeteranganKegiatanRow, "kegiatan_id" | "tipe" | "urutan"> &
          Partial<Pick<KeteranganKegiatanRow, "id" | "isi_text" | "image_url" | "created_at" | "updated_at">>;
        Update: Partial<Pick<KeteranganKegiatanRow, "tipe" | "isi_text" | "image_url" | "urutan">>;
        Relationships: [];
      };
      reviews: {
        Row: ReviewRow;
        Insert: Pick<ReviewRow, "kegiatan_id" | "status"> &
          Partial<Pick<ReviewRow, "id" | "catatan" | "created_at" | "updated_at">>;
        Update: Partial<Pick<ReviewRow, "status" | "catatan">>;
        Relationships: [];
      };
      monthly_reviews: {
        Row: MonthlyReviewRow;
        Insert: Pick<MonthlyReviewRow, "user_id" | "tahun" | "bulan"> &
          Partial<
            Pick<
              MonthlyReviewRow,
              "id" | "rekomendasi" | "status" | "catatan" | "created_at" | "updated_at"
            >
          >;
        Update: Partial<Pick<MonthlyReviewRow, "rekomendasi" | "status" | "catatan">>;
        Relationships: [];
      };
      indikator: {
        Row: IndikatorRow;
        Insert: Pick<IndikatorRow, "nama"> &
          Partial<
            Pick<
              IndikatorRow,
              "id" | "target_bulanan" | "bidang_id" | "user_id" | "created_at" | "updated_at"
            >
          >;
        Update: Partial<Pick<IndikatorRow, "nama" | "target_bulanan" | "bidang_id" | "user_id">>;
        Relationships: [];
      };
      kegiatan_indikator: {
        Row: KegiatanIndikatorRow;
        Insert: Pick<KegiatanIndikatorRow, "kegiatan_id" | "indikator_id"> &
          Partial<Pick<KegiatanIndikatorRow, "created_at">>;
        Update: Partial<Pick<KegiatanIndikatorRow, "kegiatan_id" | "indikator_id">>;
        Relationships: [];
      };
      laporan_tambahan: {
        Row: LaporanTambahanRow;
        Insert: Pick<LaporanTambahanRow, "judul"> &
          Partial<Pick<LaporanTambahanRow, "id" | "deskripsi" | "format" | "urutan" | "created_by" | "created_at" | "updated_at">>;
        Update: Partial<Pick<LaporanTambahanRow, "judul" | "deskripsi" | "format" | "urutan">>;
        Relationships: [];
      };
      laporan_tambahan_bidang: {
        Row: LaporanTambahanBidangRow;
        Insert: Pick<LaporanTambahanBidangRow, "laporan_id" | "bidang_id">;
        Update: Partial<Pick<LaporanTambahanBidangRow, "laporan_id" | "bidang_id">>;
        Relationships: [];
      };
      laporan_tambahan_kolom: {
        Row: LaporanTambahanKolomRow;
        Insert: Pick<LaporanTambahanKolomRow, "laporan_id" | "label" | "tipe"> &
          Partial<Pick<LaporanTambahanKolomRow, "id" | "wajib" | "urutan" | "satuan" | "created_at" | "updated_at">>;
        Update: Partial<Pick<LaporanTambahanKolomRow, "label" | "tipe" | "wajib" | "urutan" | "satuan">>;
        Relationships: [];
      };
      laporan_tambahan_baris: {
        Row: LaporanTambahanBarisRow;
        Insert: Pick<LaporanTambahanBarisRow, "laporan_id" | "user_id" | "bulan" | "tahun"> &
          Partial<Pick<LaporanTambahanBarisRow, "id" | "urutan" | "created_at" | "updated_at">>;
        Update: Partial<Pick<LaporanTambahanBarisRow, "urutan">>;
        Relationships: [];
      };
      laporan_tambahan_nilai: {
        Row: LaporanTambahanNilaiRow;
        Insert: Pick<LaporanTambahanNilaiRow, "baris_id" | "kolom_id"> &
          Partial<Pick<LaporanTambahanNilaiRow, "nilai">>;
        Update: Partial<Pick<LaporanTambahanNilaiRow, "nilai">>;
        Relationships: [];
      };
      revisi_baris: {
        Row: RevisiBarisRow;
        Insert: Pick<RevisiBarisRow, "baris_id"> &
          Partial<Pick<RevisiBarisRow, "catatan" | "created_at" | "updated_at">>;
        Update: Partial<Pick<RevisiBarisRow, "catatan">>;
        Relationships: [];
      };
      laporan_section: {
        Row: LaporanSectionRow;
        Insert: Pick<LaporanSectionRow, "kode" | "judul"> &
          Partial<Pick<LaporanSectionRow, "urutan">>;
        Update: Partial<Pick<LaporanSectionRow, "judul" | "urutan">>;
        Relationships: [];
      };
      laporan_section_bidang: {
        Row: LaporanSectionBidangRow;
        Insert: Pick<LaporanSectionBidangRow, "kode" | "bidang_id">;
        Update: Partial<Pick<LaporanSectionBidangRow, "kode" | "bidang_id">>;
        Relationships: [];
      };
      pengaturan: {
        Row: PengaturanRow;
        Insert: Pick<PengaturanRow, "kunci"> &
          Partial<Pick<PengaturanRow, "nilai" | "updated_at">>;
        Update: Partial<Pick<PengaturanRow, "nilai">>;
        Relationships: [];
      };
    };
    Functions: {
      is_superadmin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
    };
    Views: {
      [_ in never]: never;
    };
  };
};
