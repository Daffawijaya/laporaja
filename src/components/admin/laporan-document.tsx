import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { LaporanFormat } from "@/lib/supabase/database.types";

export interface PdfTambahan {
  judul: string;
  deskripsi: string | null;
  format: LaporanFormat;
  kolom: string[];
  baris: string[][];
}

export interface LaporanPdfData {
  ownerNama: string;
  bidangNama: string | null;
  subBidang: string[];
  unitKerja: string | null;
  tambahan: PdfTambahan[];
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 56,
    paddingHorizontal: 44,
    fontFamily: "Helvetica",
    fontSize: 11,
    color: "#1d1d1f",
    lineHeight: 1.5,
  },
  title: {
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 16,
    letterSpacing: 2,
  },
  metaRow: { flexDirection: "row", marginBottom: 3 },
  metaLabel: { width: 80, fontSize: 10, color: "#6e6e73" },
  metaValue: { fontSize: 11, flex: 1 },
  subItem: { fontSize: 11, marginLeft: 80, marginBottom: 1 },
  divider: { borderBottomWidth: 1, borderBottomColor: "#e5e5ea", marginVertical: 12 },
  paragraph: { fontSize: 11, marginTop: 2 },
  tambahanJudul: { fontSize: 12, fontWeight: "bold", marginTop: 12, marginBottom: 6 },
  tabelHead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#1d1d1f",
    paddingBottom: 3,
    marginBottom: 3,
  },
  tabelRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5ea",
    paddingVertical: 3,
  },
  selHead: { fontSize: 8, fontWeight: "bold", color: "#6e6e73", paddingRight: 4 },
  sel: { fontSize: 8, paddingRight: 4 },
  empty: { fontSize: 11, color: "#6e6e73", marginTop: 8 },
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

// Dokumen isian section satu user: identitas + seluruh section dinamis
// (tabel, esai, judul) tanpa bulan. Dirender di server lewat Route Handler.
export function LaporanDocument({ data }: { data: LaporanPdfData }) {
  return (
    <Document title={`Laporan ${data.ownerNama}`} author="LaporAja">
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>LAPORAN</Text>

        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Nama</Text>
          <Text style={styles.metaValue}>{data.ownerNama}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Bidang</Text>
          <Text style={styles.metaValue}>{data.bidangNama ?? "-"}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Sub Bidang</Text>
          <Text style={styles.metaValue}>{data.subBidang.length === 0 ? "-" : ""}</Text>
        </View>
        {data.subBidang.map((nama) => (
          <Text key={nama} style={styles.subItem}>
            - {nama}
          </Text>
        ))}
        {data.unitKerja ? (
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Unit Kerja</Text>
            <Text style={styles.metaValue}>{data.unitKerja}</Text>
          </View>
        ) : null}

        <View style={styles.divider} />

        {data.tambahan.length === 0 && (
          <Text style={styles.empty}>Belum ada section untuk user ini.</Text>
        )}

        {data.tambahan.map((laporan) => (
          <View key={laporan.judul} break={laporan.baris.length > 6}>
            <Text style={styles.tambahanJudul}>{laporan.judul.toUpperCase()}</Text>
            {laporan.deskripsi ? (
              <Text style={[styles.paragraph, { color: "#6e6e73" }]}>{laporan.deskripsi}</Text>
            ) : null}
            {laporan.format === "judul" ? null : laporan.format === "esai" ? (
              <Text style={styles.paragraph}>
                {laporan.baris[0]?.[0] || "Belum ada isian."}
              </Text>
            ) : laporan.baris.length === 0 ? (
              <Text style={styles.empty}>Belum ada isian.</Text>
            ) : (
              <View>
                <View style={styles.tabelHead}>
                  <Text style={[styles.selHead, { width: 18 }]}>No</Text>
                  {laporan.kolom.map((label, colIndex) => (
                    <Text key={colIndex} style={[styles.selHead, { flex: 1 }]}>
                      {label}
                    </Text>
                  ))}
                </View>
                {laporan.baris.map((cells, index) => (
                  <View key={index} style={styles.tabelRow}>
                    <Text style={[styles.sel, { width: 18 }]}>{index + 1}</Text>
                    {cells.map((cell, colIndex) => (
                      <Text key={colIndex} style={[styles.sel, { flex: 1 }]}>
                        {cell || "-"}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) => `Halaman ${pageNumber} dari ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}
