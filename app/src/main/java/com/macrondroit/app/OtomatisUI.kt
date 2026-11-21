package com.macrondroit.app

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import android.widget.Toast
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Bolt
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TimePicker
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.core.graphics.drawable.toBitmap
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale

private fun mulai(c: Context, i: Intent) {
    try {
        c.startActivity(i)
    } catch (e: Exception) {
        // layar pengaturan tidak tersedia di HP ini
    }
}

private fun ulangTeks(u: Int): String = when (u) {
    Ulang.HARIAN -> "Setiap hari"
    Ulang.MINGGUAN -> "Setiap minggu"
    Ulang.BULANAN -> "Setiap bulan"
    else -> "Sekali"
}

@Composable
fun PanelOtomatis(pusat: Pusat, onBuka: (Aturan) -> Unit) {
    val o = pusat.otomasi
    val konteks = LocalContext.current
    val sekarang = System.currentTimeMillis()
    val baris = o.aturan
        .map { it to berikutDari(it.waktu, it.ulang, sekarang) }
        .sortedWith(
            compareBy<Pair<Aturan, Long?>>({ it.second == null }, { it.second ?: Long.MAX_VALUE })
        )

    val perluDnd = !o.dndAman && o.aturan.any { it.aksi == Aksi.SENYAP }
    val perluOverlay = !o.overlayAman && o.aturan.any { it.aksi == Aksi.BUKA_APP }
    val perluAkses = !o.aksesAman &&
        o.aturan.any { it.aksi == Aksi.PESAWAT_ON || it.aksi == Aksi.PESAWAT_OFF }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 18.dp, bottom = 190.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        if (perluDnd || perluOverlay || perluAkses) {
            item(key = "izin") {
                KartuIzin(
                    perluDnd = perluDnd,
                    perluOverlay = perluOverlay,
                    perluAkses = perluAkses,
                    onDnd = { mulai(konteks, Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS)) },
                    onOverlay = {
                        mulai(
                            konteks,
                            Intent(
                                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                                Uri.parse("package:" + konteks.packageName)
                            )
                        )
                    },
                    onAkses = { mulai(konteks, Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }
                )
            }
        }
        if (baris.isEmpty()) {
            item(key = "kosong") {
                KartuKosong(
                    Icons.Rounded.Bolt,
                    "Belum ada otomatisasi",
                    "Ketuk tombol + di kanan bawah. Contoh: jam 22.00 senyapkan HP, jam 05.00 suara normal lagi.",
                    "Mulai dari sini"
                )
            }
        } else {
            items(baris, key = { it.first.id }) { (a, waktu) ->
                KartuAturan(
                    a = a,
                    waktu = waktu,
                    onBuka = { onBuka(a) },
                    onAktif = { o.aktifkan(a, it) },
                    onCoba = {
                        val pesan = Pelaksana.jalankan(konteks, a)
                        Toast.makeText(konteks, pesan, Toast.LENGTH_LONG).show()
                    }
                )
            }
        }
    }
}

@Composable
private fun KartuAturan(
    a: Aturan,
    waktu: Long?,
    onBuka: () -> Unit,
    onAktif: (Boolean) -> Unit,
    onCoba: () -> Unit
) {
    val utama = MaterialTheme.colorScheme.primary
    val bentuk = RoundedCornerShape(22.dp)
    val zona = ZoneId.systemDefault()
    val tampil = Instant.ofEpochMilli(waktu ?: a.waktu).atZone(zona)
    val jam = remember { DateTimeFormatter.ofPattern("HH:mm") }
    val tanggal = remember { DateTimeFormatter.ofPattern("d MMM", Locale("id", "ID")) }
    val redup = waktu == null || !a.aktif
    val alfa by animateFloatAsState(if (redup) 0.5f else 1f, tween(300), label = "alfaAturan")
    val judul = a.nama.ifBlank { Aksi.nama(a.aksi, a.namaApp) }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .dapatDitekan(onBuka)
            .shadow(
                elevation = 8.dp,
                shape = bentuk,
                ambientColor = utama.copy(alpha = 0.18f),
                spotColor = utama.copy(alpha = 0.28f)
            )
            .clip(bentuk)
            .background(Color.White)
            .padding(14.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(
                modifier = Modifier
                    .alpha(alfa)
                    .clip(RoundedCornerShape(16.dp))
                    .background(utama.copy(alpha = 0.12f))
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = tampil.format(jam),
                    color = utama,
                    fontSize = 19.sp,
                    fontWeight = FontWeight.ExtraBold
                )
                Text(
                    text = tampil.format(tanggal),
                    color = Slate.s500,
                    style = MaterialTheme.typography.labelMedium
                )
            }
            Spacer(Modifier.width(14.dp))
            Column(modifier = Modifier.weight(1f).alpha(alfa)) {
                Text(
                    text = judul,
                    style = MaterialTheme.typography.titleMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    text = Aksi.nama(a.aksi, a.namaApp) + " · " + ulangTeks(a.ulang),
                    style = MaterialTheme.typography.bodyMedium,
                    color = Slate.s500,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }
            Spacer(Modifier.width(8.dp))
            Switch(
                checked = a.aktif,
                onCheckedChange = onAktif,
                colors = SwitchDefaults.colors(
                    checkedThumbColor = Color.White,
                    checkedTrackColor = utama,
                    checkedBorderColor = Color.Transparent,
                    uncheckedThumbColor = Color.White,
                    uncheckedTrackColor = Slate.s200,
                    uncheckedBorderColor = Color.Transparent
                )
            )
        }
        Spacer(Modifier.height(10.dp))
        Text(
            text = "Coba sekarang",
            color = utama,
            style = MaterialTheme.typography.labelLarge,
            modifier = Modifier
                .dapatDitekan(onCoba)
                .clip(RoundedCornerShape(50))
                .background(utama.copy(alpha = 0.12f))
                .padding(horizontal = 14.dp, vertical = 7.dp)
        )
    }
}

@Composable
private fun BarisIzin(judul: String, keterangan: String, onKlik: () -> Unit) {
    val utama = MaterialTheme.colorScheme.primary
    val kedua = MaterialTheme.colorScheme.secondary
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(judul, style = MaterialTheme.typography.titleMedium, color = Color(0xFF7A4B00))
            Text(keterangan, style = MaterialTheme.typography.bodyMedium, color = Color(0xFF7A4B00))
        }
        Spacer(Modifier.width(10.dp))
        Text(
            text = "Atur",
            color = Color.White,
            style = MaterialTheme.typography.labelLarge,
            modifier = Modifier
                .dapatDitekan(onKlik)
                .clip(RoundedCornerShape(50))
                .background(Brush.horizontalGradient(listOf(utama, kedua)))
                .padding(horizontal = 18.dp, vertical = 10.dp)
        )
    }
}

@Composable
private fun KartuIzin(
    perluDnd: Boolean,
    perluOverlay: Boolean,
    perluAkses: Boolean,
    onDnd: () -> Unit,
    onOverlay: () -> Unit,
    onAkses: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(22.dp))
            .background(Color(0xFFFFF4E0))
            .padding(18.dp)
    ) {
        Text(
            text = "Izin yang dibutuhkan",
            style = MaterialTheme.typography.titleMedium,
            color = Color(0xFF7A4B00)
        )
        if (perluDnd) {
            BarisIzin(
                "Jangan Ganggu",
                "Agar HP bisa benar-benar senyap. Cari Macrondroit lalu nyalakan.",
                onDnd
            )
        }
        if (perluOverlay) {
            BarisIzin(
                "Tampil di atas aplikasi lain",
                "Agar aplikasi bisa dibuka otomatis dari latar belakang.",
                onOverlay
            )
        }
        if (perluAkses) {
            BarisIzin(
                "Layanan aksesibilitas",
                "Agar mode pesawat bisa diubah otomatis. Cari Macrondroit lalu nyalakan.",
                onAkses
            )
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Formulir aturan
// ---------------------------------------------------------------------------------------------

private data class InfoApp(val nama: String, val paket: String)

private fun daftarApp(c: Context): List<InfoApp> {
    val pm = c.packageManager
    val i = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
    return pm.queryIntentActivities(i, 0)
        .map { InfoApp(it.loadLabel(pm).toString(), it.activityInfo.packageName) }
        .filter { it.paket != c.packageName }
        .distinctBy { it.paket }
        .sortedBy { it.nama.lowercase() }
}

@Composable
private fun IkonApp(paket: String) {
    val konteks = LocalContext.current
    val ikon: ImageBitmap? = remember(paket) {
        try {
            konteks.packageManager.getApplicationIcon(paket).toBitmap(96, 96).asImageBitmap()
        } catch (e: Exception) {
            null
        }
    }
    if (ikon != null) {
        Image(bitmap = ikon, contentDescription = null, modifier = Modifier.size(40.dp))
    } else {
        Box(modifier = Modifier.size(40.dp))
    }
}

@Composable
private fun DialogPilihApp(onPilih: (InfoApp) -> Unit, onTutup: () -> Unit) {
    val konteks = LocalContext.current
    val semua = remember { daftarApp(konteks) }
    Dialog(onDismissRequest = onTutup) {
        Column(
            modifier = Modifier
                .clip(RoundedCornerShape(28.dp))
                .background(Color.White)
                .padding(vertical = 20.dp)
        ) {
            Text(
                "Pilih aplikasi",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(horizontal = 24.dp, vertical = 4.dp)
            )
            Spacer(Modifier.height(8.dp))
            LazyColumn(modifier = Modifier.heightIn(max = 420.dp)) {
                items(semua, key = { it.paket }) { app ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .dapatDitekan { onPilih(app) }
                            .padding(horizontal = 24.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        IkonApp(app.paket)
                        Spacer(Modifier.width(14.dp))
                        Text(
                            app.nama,
                            style = MaterialTheme.typography.titleMedium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
            }
            Text(
                "Batal",
                color = Slate.s600,
                modifier = Modifier
                    .align(Alignment.End)
                    .dapatDitekan(onTutup)
                    .padding(horizontal = 24.dp, vertical = 12.dp)
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DialogTanggalAturan(
    sekarang: LocalDateTime,
    onPilih: (LocalDateTime) -> Unit,
    onTutup: () -> Unit
) {
    val utama = MaterialTheme.colorScheme.primary
    val st = rememberDatePickerState(
        initialSelectedDateMillis = sekarang.toLocalDate()
            .atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli()
    )
    DatePickerDialog(
        onDismissRequest = onTutup,
        confirmButton = {
            Text(
                "Pilih",
                color = utama,
                fontWeight = FontWeight.Bold,
                modifier = Modifier
                    .dapatDitekan {
                        st.selectedDateMillis?.let { ms ->
                            val tgl = Instant.ofEpochMilli(ms).atZone(ZoneOffset.UTC).toLocalDate()
                            onPilih(tgl.atTime(sekarang.toLocalTime()))
                        }
                        onTutup()
                    }
                    .padding(horizontal = 16.dp, vertical = 10.dp)
            )
        },
        dismissButton = {
            Text(
                "Batal",
                color = Slate.s600,
                modifier = Modifier
                    .dapatDitekan(onTutup)
                    .padding(horizontal = 16.dp, vertical = 10.dp)
            )
        }
    ) {
        DatePicker(state = st)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DialogJamAturan(
    sekarang: LocalDateTime,
    onPilih: (LocalDateTime) -> Unit,
    onTutup: () -> Unit
) {
    val utama = MaterialTheme.colorScheme.primary
    val st = rememberTimePickerState(
        initialHour = sekarang.hour,
        initialMinute = sekarang.minute,
        is24Hour = true
    )
    Dialog(onDismissRequest = onTutup) {
        Column(
            modifier = Modifier
                .clip(RoundedCornerShape(28.dp))
                .background(Color.White)
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text("Pilih jam", style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(16.dp))
            TimePicker(state = st)
            Spacer(Modifier.height(8.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                Text(
                    "Batal",
                    color = Slate.s600,
                    modifier = Modifier
                        .dapatDitekan(onTutup)
                        .padding(horizontal = 16.dp, vertical = 10.dp)
                )
                Text(
                    "Pilih",
                    color = utama,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier
                        .dapatDitekan {
                            onPilih(sekarang.withHour(st.hour).withMinute(st.minute))
                            onTutup()
                        }
                        .padding(horizontal = 16.dp, vertical = 10.dp)
                )
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun FormAturan(
    awal: Aturan?,
    idBaru: () -> Int,
    onSimpan: (Aturan) -> Unit,
    onHapus: (Aturan) -> Unit,
    onTutup: () -> Unit
) {
    val utama = MaterialTheme.colorScheme.primary
    val kedua = MaterialTheme.colorScheme.secondary
    val zona = ZoneId.systemDefault()

    val waktuAwal = remember {
        awal?.waktu ?: LocalDateTime.now().plusHours(1).withMinute(0).withSecond(0).withNano(0)
            .atZone(zona).toInstant().toEpochMilli()
    }
    val tAwal = remember { Instant.ofEpochMilli(waktuAwal).atZone(zona).toLocalDateTime() }

    var nama by remember { mutableStateOf(awal?.nama ?: "") }
    var aksi by remember { mutableIntStateOf(awal?.aksi ?: Aksi.SENYAP) }
    var paket by remember { mutableStateOf(awal?.paket ?: "") }
    var namaApp by remember { mutableStateOf(awal?.namaApp ?: "") }
    var tanggalJam by remember { mutableStateOf(tAwal) }
    var ulang by remember { mutableIntStateOf(awal?.ulang ?: Ulang.TIDAK) }
    var salah by remember { mutableStateOf(false) }
    var dialogTanggal by remember { mutableStateOf(false) }
    var dialogJam by remember { mutableStateOf(false) }
    var dialogApp by remember { mutableStateOf(false) }

    val fmtTanggal = remember { DateTimeFormatter.ofPattern("EEE, d MMM yyyy", Locale("id", "ID")) }
    val fmtJam = remember { DateTimeFormatter.ofPattern("HH:mm") }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 22.dp)
                .navigationBarsPadding()
                .padding(bottom = 24.dp)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = if (awal == null) "Otomatisasi baru" else "Ubah otomatisasi",
                    style = MaterialTheme.typography.titleLarge,
                    modifier = Modifier.weight(1f)
                )
                Text(
                    text = "Tutup",
                    color = Slate.s600,
                    style = MaterialTheme.typography.labelLarge,
                    modifier = Modifier
                        .dapatDitekan(onTutup)
                        .clip(RoundedCornerShape(50))
                        .background(Slate.s100)
                        .padding(horizontal = 16.dp, vertical = 9.dp)
                )
            }

            Label("Nama (boleh kosong)")
            OutlinedTextField(
                value = nama,
                onValueChange = { nama = it },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                placeholder = { Text("Misalnya: Senyap malam") },
                shape = RoundedCornerShape(18.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = Color.White,
                    unfocusedContainerColor = Color.White,
                    focusedBorderColor = utama,
                    unfocusedBorderColor = Slate.s200
                )
            )

            Label("Lakukan apa")
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Pilihan("Senyapkan HP", aksi == Aksi.SENYAP) { aksi = Aksi.SENYAP; salah = false }
                Pilihan("Suara normal", aksi == Aksi.SUARA_NORMAL) { aksi = Aksi.SUARA_NORMAL; salah = false }
                Pilihan("Nyalakan mode pesawat", aksi == Aksi.PESAWAT_ON) { aksi = Aksi.PESAWAT_ON; salah = false }
                Pilihan("Matikan mode pesawat", aksi == Aksi.PESAWAT_OFF) { aksi = Aksi.PESAWAT_OFF; salah = false }
                Pilihan("Buka aplikasi", aksi == Aksi.BUKA_APP) { aksi = Aksi.BUKA_APP }
            }

            if (aksi == Aksi.BUKA_APP) {
                Label("Aplikasi yang dibuka")
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .dapatDitekan { dialogApp = true }
                        .clip(RoundedCornerShape(18.dp))
                        .background(utama.copy(alpha = 0.10f))
                        .padding(horizontal = 16.dp, vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    if (paket.isNotBlank()) {
                        IkonApp(paket)
                        Spacer(Modifier.width(12.dp))
                    }
                    Text(
                        text = if (namaApp.isBlank()) "Ketuk untuk memilih aplikasi" else namaApp,
                        style = MaterialTheme.typography.titleMedium,
                        color = utama
                    )
                }
                if (salah) {
                    Text(
                        "Pilih aplikasinya dulu ya",
                        color = Color(0xFFD32F2F),
                        style = MaterialTheme.typography.labelMedium,
                        modifier = Modifier.padding(start = 4.dp, top = 4.dp)
                    )
                }
            }

            Label("Kapan")
            Row(modifier = Modifier.fillMaxWidth()) {
                KotakWaktu(
                    judul = "Tanggal",
                    nilai = tanggalJam.format(fmtTanggal),
                    onKlik = { dialogTanggal = true },
                    modifier = Modifier.weight(1.6f)
                )
                Spacer(Modifier.width(10.dp))
                KotakWaktu(
                    judul = "Jam",
                    nilai = tanggalJam.format(fmtJam),
                    onKlik = { dialogJam = true },
                    modifier = Modifier.weight(1f)
                )
            }

            Label("Ulangi")
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Pilihan("Sekali", ulang == Ulang.TIDAK) { ulang = Ulang.TIDAK }
                Pilihan("Harian", ulang == Ulang.HARIAN) { ulang = Ulang.HARIAN }
                Pilihan("Mingguan", ulang == Ulang.MINGGUAN) { ulang = Ulang.MINGGUAN }
                Pilihan("Bulanan", ulang == Ulang.BULANAN) { ulang = Ulang.BULANAN }
            }

            Spacer(Modifier.height(28.dp))
            Text(
                text = "Simpan",
                color = Color.White,
                fontWeight = FontWeight.Bold,
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier
                    .fillMaxWidth()
                    .dapatDitekan {
                        if (aksi == Aksi.BUKA_APP && paket.isBlank()) {
                            salah = true
                        } else {
                            val ms = tanggalJam.atZone(zona).toInstant().toEpochMilli()
                            onSimpan(
                                Aturan(
                                    id = awal?.id ?: idBaru(),
                                    nama = nama.trim(),
                                    waktu = ms,
                                    ulang = ulang,
                                    aksi = aksi,
                                    paket = if (aksi == Aksi.BUKA_APP) paket else "",
                                    namaApp = if (aksi == Aksi.BUKA_APP) namaApp else "",
                                    aktif = true
                                )
                            )
                        }
                    }
                    .clip(RoundedCornerShape(50))
                    .background(Brush.horizontalGradient(listOf(utama, kedua)))
                    .padding(vertical = 16.dp),
                textAlign = TextAlign.Center
            )

            if (awal != null) {
                Spacer(Modifier.height(12.dp))
                Text(
                    text = "Hapus",
                    color = Color(0xFFD32F2F),
                    fontWeight = FontWeight.SemiBold,
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier
                        .fillMaxWidth()
                        .dapatDitekan { onHapus(awal) }
                        .clip(RoundedCornerShape(50))
                        .background(Color(0xFFD32F2F).copy(alpha = 0.10f))
                        .padding(vertical = 16.dp),
                    textAlign = TextAlign.Center
                )
            }
        }
    }

    if (dialogTanggal) {
        DialogTanggalAturan(tanggalJam, { tanggalJam = it }) { dialogTanggal = false }
    }
    if (dialogJam) {
        DialogJamAturan(tanggalJam, { tanggalJam = it }) { dialogJam = false }
    }
    if (dialogApp) {
        DialogPilihApp(
            onPilih = {
                paket = it.paket
                namaApp = it.nama
                salah = false
                dialogApp = false
            },
            onTutup = { dialogApp = false }
        )
    }
}
