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

export type IndikatorRow = {
  id: string;
  nama: string;
  target: number;
  tahun: number;
  bulan_mulai: number;
  bulan_selesai: number;
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
        Update: Partial<Pick<ProfileRow, "nama" | "username" | "role" | "bidang_id">>;
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
      indikator: {
        Row: IndikatorRow;
        Insert: Pick<
          IndikatorRow,
          "nama" | "target" | "tahun" | "bulan_mulai" | "bulan_selesai"
        > &
          Partial<
            Pick<IndikatorRow, "id" | "bidang_id" | "user_id" | "created_at" | "updated_at">
          >;
        Update: Partial<
          Pick<
            IndikatorRow,
            "nama" | "target" | "tahun" | "bulan_mulai" | "bulan_selesai" | "bidang_id" | "user_id"
          >
        >;
        Relationships: [];
      };
      kegiatan_indikator: {
        Row: KegiatanIndikatorRow;
        Insert: Pick<KegiatanIndikatorRow, "kegiatan_id" | "indikator_id"> &
          Partial<Pick<KegiatanIndikatorRow, "created_at">>;
        Update: Partial<Pick<KegiatanIndikatorRow, "kegiatan_id" | "indikator_id">>;
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
