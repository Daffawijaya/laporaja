import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

export interface PdfBlock {
  tipe: "text" | "image";
  text: string | null;
  imageUrl: string | null;
}

export interface PdfKegiatan {
  nama: string;
  status: "approved" | "revision" | null;
  catatan: string | null;
  blocks: PdfBlock[];
}

export interface PdfDay {
  label: string;
  kegiatan: PdfKegiatan[];
}

export interface LaporanPdfData {
  ownerNama: string;
  bidangNama: string | null;
  subBidang: string[];
  periode: string;
  days: PdfDay[];
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
  dateHeading: { fontSize: 12, fontWeight: "bold", marginTop: 12, marginBottom: 6 },
  kegiatanBox: { marginBottom: 10 },
  fieldLabel: { fontSize: 10, color: "#6e6e73", marginTop: 5 },
  fieldValue: { fontSize: 11 },
  paragraph: { fontSize: 11, marginTop: 2 },
  image: { width: "100%", maxHeight: 340, objectFit: "contain", marginTop: 6 },
  caption: { fontSize: 10, color: "#6e6e73", marginTop: 2 },
  statusApproved: { fontSize: 11, fontWeight: "bold", color: "#067647" },
  statusRevision: { fontSize: 11, fontWeight: "bold", color: "#b42318" },
  statusPending: { fontSize: 11, color: "#6e6e73" },
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

function StatusLine({ status, catatan }: { status: PdfKegiatan["status"]; catatan: string | null }) {
  if (status === "approved") {
    return <Text style={styles.statusApproved}>Status: Disetujui</Text>;
  }
  if (status === "revision") {
    return (
      <View>
        <Text style={styles.statusRevision}>Status: Revisi</Text>
        {catatan && <Text style={styles.fieldValue}>Catatan: {catatan}</Text>}
      </View>
    );
  }
  return <Text style={styles.statusPending}>Status: Menunggu Review</Text>;
}

// Dokumen resmi yang mudah dicetak: A4, teks vektor, gambar proporsional,
// tanpa dekorasi. Dirender di server lewat Route Handler export.
export function LaporanDocument({ data }: { data: LaporanPdfData }) {
  return (
    <Document
      title={`Laporan Kegiatan ${data.ownerNama} ${data.periode}`}
      author="LaporAja"
    >
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>LAPORAN KEGIATAN</Text>

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
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Periode</Text>
          <Text style={styles.metaValue}>{data.periode}</Text>
        </View>

        <View style={styles.divider} />

        {data.days.length === 0 && (
          <Text style={styles.empty}>Belum ada kegiatan pada periode ini.</Text>
        )}

        {data.days.map((day) => (
          <View key={day.label}>
            <Text style={styles.dateHeading}>{day.label}</Text>
            {day.kegiatan.map((kegiatan, index) => (
              <View key={`${day.label}-${index}`} style={styles.kegiatanBox}>
                <Text style={styles.fieldLabel}>Nama Kegiatan</Text>
                <Text style={styles.fieldValue}>{kegiatan.nama}</Text>
                <View style={{ marginTop: 3 }}>
                  <StatusLine status={kegiatan.status} catatan={kegiatan.catatan} />
                </View>
                {kegiatan.blocks.length > 0 && (
                  <Text style={styles.fieldLabel}>Keterangan</Text>
                )}
                {kegiatan.blocks.map((block, blockIndex) =>
                  block.tipe === "text" ? (
                    <Text key={blockIndex} style={styles.paragraph}>
                      {block.text}
                    </Text>
                  ) : block.imageUrl ? (
                    <View key={blockIndex}>
                      {/* eslint-disable-next-line jsx-a11y/alt-text -- Image react-pdf tidak menerima prop alt */}
                      <Image src={block.imageUrl} style={styles.image} />
                      {block.text && <Text style={styles.caption}>{block.text}</Text>}
                    </View>
                  ) : null
                )}
              </View>
            ))}
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
