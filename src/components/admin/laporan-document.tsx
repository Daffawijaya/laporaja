import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { LaporanFormat } from "@/lib/supabase/database.types";
import { parseGambarNilai } from "@/lib/laporan-tambahan/queries";

export interface PdfTambahan {
  judul: string;
  deskripsi: string | null;
  format: LaporanFormat;
  kolom: string[];
  kolomTipe: string[];
  baris: string[][];
  /** URL gambar per sel "barisIdx:kolomIdx" untuk kolom tipe image. */
  gambarUrl: Record<string, string>;
}

export interface PdfTtd {
  peran: string;
  nama: string;
  jabatan: string;
  pangkat: string;
  nip: string;
  /** URL/base64 gambar tanda tangan, null bila belum ada. */
  gambarUrl: string | null;
}

export interface LaporanPdfData {
  /** Judul kartu Info di /admin/section (fallback "LAPORAN"). */
  infoJudul: string | null;
  periode: { tahun: number; bulan: number } | null;
  ownerNama: string;
  /** Jabatan global (pengaturan jabatan_awalan). */
  jabatan: string | null;
  unitKerja: string | null;
  tambahan: PdfTambahan[];
  /** TTD terurut tampil (manual + kartu otomatis pelapor). */
  ttd: PdfTtd[];
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 56,
    paddingHorizontal: 44,
    fontFamily: "Times-Roman",
    fontSize: 11,
    color: "#1d1d1f",
    lineHeight: 1.5,
  },
  title: {
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 16,
  },
  metaRow: { flexDirection: "row", marginBottom: 3 },
  metaLabel: { width: 80, fontSize: 10, color: "#6e6e73" },
  metaValue: { fontSize: 11, flex: 1 },
  subItem: { fontSize: 11, marginLeft: 80, marginBottom: 1 },
  divider: { borderBottomWidth: 1, borderBottomColor: "#e5e5ea", marginVertical: 12 },
  paragraph: { fontSize: 11, marginTop: 2 },
  esaiSub: { fontSize: 11, fontWeight: "bold", marginTop: 8, marginBottom: 2 },
  tambahanJudul: { fontSize: 12, fontWeight: "bold", marginTop: 12, marginBottom: 6 },
  tabelWrap: {
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: "#000",
    borderLeftWidth: 1,
    borderLeftColor: "#000",
    borderRightWidth: 1,
    borderRightColor: "#000",
  },
  tabelHead: { flexDirection: "row" },
  tabelRow: { flexDirection: "row" },
  selHead: {
    fontSize: 9,
    fontWeight: "bold",
    padding: 4,
    borderRightWidth: 1,
    borderRightColor: "#000",
    borderBottomWidth: 1,
    borderBottomColor: "#000",
  },
  sel: {
    fontSize: 9,
    padding: 4,
    borderRightWidth: 1,
    borderRightColor: "#000",
    borderBottomWidth: 1,
    borderBottomColor: "#000",
  },
  gambar: { width: 140, marginBottom: 4 },
  empty: { fontSize: 11, color: "#6e6e73", marginTop: 8 },
  ttdWrap: { marginTop: 20 },
  ttdBaris: { flexDirection: "row", marginBottom: 8 },
  ttdKolom: { flex: 1, textAlign: "center", paddingHorizontal: 6 },
  // Kepala (peran + jabatan) selalu setinggi 2 baris + area gambar selalu
  // 70pt (terisi/spacer) supaya semua nama sejajar tingginya.
  ttdKepala: { minHeight: 30 },
  ttdPeran: { fontSize: 10 },
  ttdJabatan: { fontSize: 10 },
  ttdGambar: { width: 90, height: 70, alignSelf: "center", marginVertical: 6, objectFit: "contain" },
  ttdSpasiGambar: { height: 70, marginVertical: 6 },
  ttdNama: { fontSize: 10, fontWeight: "bold", textDecoration: "underline" },
  ttdMeta: { fontSize: 9, color: "#6e6e73" },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 44,
    right: 44,
    fontSize: 9,
    color: "#6e6e73",
    textAlign: "center",
  },
});

// Dokumen isian section satu user: susunannya menyamai /admin/section —
// kartu Info di atas (judul info + Bulan/Tahun/Nama/Jabatan/Unit kerja),
// lalu seluruh section dinamis mengikuti urutan builder (tabel, esai,
// judul sebagai pembatas, indikator sebagai tabel), lalu blok tanda tangan
// di paling bawah. Dirender di server lewat Route Handler.
const NAMA_BULAN = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

// Kapital tiap awal kata ("laporan progres" → "Laporan Progres").
function kapitalAwalKata(teks: string): string {
  return teks
    .toLowerCase()
    .split(/(\s+)/)
    .map((bagian) => (bagian.charAt(0).toUpperCase() + bagian.slice(1)))
    .join("");
}

function potongTtd(ttd: PdfTtd[], ukuran = 3): PdfTtd[][] {
  const baris: PdfTtd[][] = [];
  for (let i = 0; i < ttd.length; i += ukuran) baris.push(ttd.slice(i, i + ukuran));
  return baris;
}

// Sisipkan zero-width space tiap 12 karakter tanpa spasi (mis. NIK) agar
// teks panjang bisa melipat di dalam sel dan tidak melebar keluar tabel.
function pecahKataPanjang(teks: string): string {
  return teks.replace(/(\S{12})/g, "$1\u200B");
}

export function LaporanDocument({ data }: { data: LaporanPdfData }) {
  const judulDokumen = kapitalAwalKata(data.infoJudul?.trim() || "Laporan");
  const namaBulan =
    data.periode && data.periode.bulan >= 1 && data.periode.bulan <= 12
      ? NAMA_BULAN[data.periode.bulan - 1]
      : "-";
  const tahunTeks = data.periode ? String(data.periode.tahun) : "-";
  return (
    <Document title={`${judulDokumen} ${data.ownerNama}`} author="LaporAja">
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{judulDokumen}</Text>

        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Bulan</Text>
          <Text style={styles.metaValue}>{namaBulan}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Tahun</Text>
          <Text style={styles.metaValue}>{tahunTeks}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Nama</Text>
          <Text style={styles.metaValue}>{data.ownerNama}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Jabatan</Text>
          <Text style={styles.metaValue}>{data.jabatan?.trim() ? data.jabatan : "-"}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Unit Kerja</Text>
          <Text style={styles.metaValue}>{data.unitKerja?.trim() ? data.unitKerja : "-"}</Text>
        </View>

        <View style={styles.divider} />

        {data.tambahan.length === 0 && (
          <Text style={styles.empty}>Belum ada section untuk user ini.</Text>
        )}

        {data.tambahan.map((laporan) => (
          <View
            key={laporan.judul}
            break={
              laporan.format === "tabel" || laporan.format === "indikator"
                ? laporan.baris.length > 6
                : false
            }
          >
            <Text style={styles.tambahanJudul}>{kapitalAwalKata(laporan.judul)}</Text>
            {laporan.deskripsi ? (
              <Text style={[styles.paragraph, { color: "#6e6e73" }]}>{laporan.deskripsi}</Text>
            ) : null}
            {laporan.format === "judul" ? null : laporan.format === "esai" ? (
              laporan.kolom.length <= 1 ? (
                <Text style={styles.paragraph}>
                  {laporan.baris[0]?.[0] || "Belum ada isian."}
                </Text>
              ) : (
                <View>
                  {laporan.kolom.map((label, colIndex) => (
                    <View key={colIndex}>
                      <Text style={styles.esaiSub}>{label}</Text>
                      <Text style={styles.paragraph}>
                        {laporan.baris[0]?.[colIndex] || "-"}
                      </Text>
                    </View>
                  ))}
                </View>
              )
            ) : laporan.baris.length === 0 ? (
              <Text style={styles.empty}>Belum ada isian.</Text>
            ) : (
              <View style={styles.tabelWrap}>
                <View style={styles.tabelHead}>
                  {laporan.kolom.map((label, colIndex) => (
                    <Text
                      key={colIndex}
                      style={[
                        styles.selHead,
                        { flex: 1 },
                        colIndex === laporan.kolom.length - 1
                          ? { borderRightWidth: 0 }
                          : undefined,
                      ]}
                    >
                      {label}
                    </Text>
                  ))}
                </View>
                {laporan.baris.map((cells, index) => (
                  <View key={index} style={styles.tabelRow}>
                    {cells.map((cell, colIndex) =>
                      laporan.kolomTipe[colIndex] === "image" ? (
                        <View
                          key={colIndex}
                          style={[
                            styles.sel,
                            { flex: 1 },
                            colIndex === laporan.kolom.length - 1
                              ? { borderRightWidth: 0 }
                              : undefined,
                          ]}
                        >
                          {laporan.gambarUrl[`${index}:${colIndex}`] ? (
                            // eslint-disable-next-line jsx-a11y/alt-text -- Image react-pdf tidak punya prop alt
                            <Image
                              src={laporan.gambarUrl[`${index}:${colIndex}`]}
                              style={styles.gambar}
                            />
                          ) : null}
                          <Text>
                            {parseGambarNilai(cell)?.deskripsi || "-"}
                          </Text>
                        </View>
                      ) : (
                        <Text
                          key={colIndex}
                          style={[
                            styles.sel,
                            { flex: 1 },
                            colIndex === laporan.kolom.length - 1
                              ? { borderRightWidth: 0 }
                              : undefined,
                          ]}
                        >
                          {cell ? pecahKataPanjang(cell) : "-"}
                        </Text>
                      )
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}

        {data.ttd.length > 0 ? (
          <View style={styles.ttdWrap}>
            {potongTtd(data.ttd).map((baris, barisIdx) => (
              <View key={barisIdx} style={styles.ttdBaris}>
                {baris.map((ttd, colIdx) => (
                  <View key={colIdx} style={styles.ttdKolom}>
                    <View style={styles.ttdKepala}>
                      <Text style={styles.ttdPeran}>{ttd.peran.trim() || "\u00A0"}</Text>
                      <Text style={styles.ttdJabatan}>{ttd.jabatan.trim() || "\u00A0"}</Text>
                    </View>
                    {ttd.gambarUrl ? (
                      // eslint-disable-next-line jsx-a11y/alt-text -- Image react-pdf tidak punya prop alt
                      <Image src={ttd.gambarUrl} style={styles.ttdGambar} />
                    ) : (
                      <View style={styles.ttdSpasiGambar} />
                    )}
                    <Text style={styles.ttdNama}>{ttd.nama.trim() || "-"}</Text>
                    {ttd.pangkat.trim() ? <Text style={styles.ttdMeta}>{ttd.pangkat}</Text> : null}
                    {ttd.nip.trim() ? <Text style={styles.ttdMeta}>NIP. {ttd.nip}</Text> : null}
                  </View>
                ))}
              </View>
            ))}
          </View>
        ) : null}

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) => `Halaman ${pageNumber} dari ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}
