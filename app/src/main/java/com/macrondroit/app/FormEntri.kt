package com.macrondroit.app

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale

@Composable
private fun Label(teks: String) {
    Text(
        text = teks,
        style = MaterialTheme.typography.labelLarge,
        color = Slate.s500,
        modifier = Modifier.padding(top = 18.dp, bottom = 8.dp)
    )
}

@Composable
private fun Pilihan(teks: String, terpilih: Boolean, onKlik: () -> Unit) {
    val utama = MaterialTheme.colorScheme.primary
    val latar by animateColorAsState(
        if (terpilih) utama else Slate.s100, tween(250), label = "latarPilihan"
    )
    val warnaTeks by animateColorAsState(
        if (terpilih) Color.White else Slate.s600, tween(250), label = "teksPilihan"
    )
    Text(
        text = teks,
        color = warnaTeks,
        style = MaterialTheme.typography.labelLarge,
        modifier = Modifier
            .dapatDitekan(onKlik)
            .clip(RoundedCornerShape(50))
            .background(latar)
            .padding(horizontal = 16.dp, vertical = 10.dp)
    )
}

@Composable
private fun KotakWaktu(judul: String, nilai: String, onKlik: () -> Unit, modifier: Modifier = Modifier) {
    val utama = MaterialTheme.colorScheme.primary
    Column(
        modifier = modifier
            .dapatDitekan(onKlik)
            .clip(RoundedCornerShape(18.dp))
            .background(utama.copy(alpha = 0.10f))
            .padding(horizontal = 16.dp, vertical = 12.dp)
    ) {
        Text(judul, style = MaterialTheme.typography.labelMedium, color = Slate.s500)
        Spacer(Modifier.height(2.dp))
        Text(nilai, style = MaterialTheme.typography.titleMedium, color = utama)
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun FormEntri(
    jenis: Int,
    awal: Entri?,
    idBaru: () -> Int,
    onSimpan: (Entri) -> Unit,
    onHapus: (Entri) -> Unit,
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

    var judul by remember { mutableStateOf(awal?.judul ?: "") }
    var catatan by remember { mutableStateOf(awal?.catatan ?: "") }
    var tanggalJam by remember { mutableStateOf(tAwal) }
    var ulang by remember { mutableIntStateOf(awal?.ulang ?: Ulang.TIDAK) }
    var mode by remember { mutableIntStateOf(awal?.mode ?: Mode.NOTIF) }
    var sebelum by remember { mutableIntStateOf(awal?.sebelum ?: 0) }
    var salah by remember { mutableStateOf(false) }
    var dialogTanggal by remember { mutableStateOf(false) }
    var dialogJam by remember { mutableStateOf(false) }

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
                    text = if (awal == null) {
                        if (jenis == Jenis.JADWAL) "Jadwal baru" else "Pengingat baru"
                    } else {
                        if (jenis == Jenis.JADWAL) "Ubah jadwal" else "Ubah pengingat"
                    },
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

            Label(if (jenis == Jenis.JADWAL) "Nama kegiatan" else "Isi pengingat")
            OutlinedTextField(
                value = judul,
                onValueChange = { judul = it; salah = false },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                isError = salah,
                placeholder = { Text(if (jenis == Jenis.JADWAL) "Misalnya: Rapat RT" else "Misalnya: Minum obat") },
                shape = RoundedCornerShape(18.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = Color.White,
                    unfocusedContainerColor = Color.White,
                    focusedBorderColor = utama,
                    unfocusedBorderColor = Slate.s200
                )
            )
            if (salah) {
                Text(
                    "Isi namanya dulu ya",
                    color = Color(0xFFD32F2F),
                    style = MaterialTheme.typography.labelMedium,
                    modifier = Modifier.padding(start = 4.dp, top = 4.dp)
                )
            }

            Label("Catatan (boleh kosong)")
            OutlinedTextField(
                value = catatan,
                onValueChange = { catatan = it },
                modifier = Modifier.fillMaxWidth(),
                minLines = 2,
                maxLines = 4,
                shape = RoundedCornerShape(18.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = Color.White,
                    unfocusedContainerColor = Color.White,
                    focusedBorderColor = utama,
                    unfocusedBorderColor = Slate.s200
                )
            )

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

            Label("Cara mengingatkan")
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Pilihan("Notifikasi biasa", mode == Mode.NOTIF) { mode = Mode.NOTIF }
                Pilihan("Alarm keras", mode == Mode.ALARM) { mode = Mode.ALARM }
            }

            if (jenis == Jenis.JADWAL) {
                Label("Ingatkan sebelum")
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Pilihan("Tepat waktu", sebelum == 0) { sebelum = 0 }
                    Pilihan("5 menit", sebelum == 5) { sebelum = 5 }
                    Pilihan("15 menit", sebelum == 15) { sebelum = 15 }
                    Pilihan("30 menit", sebelum == 30) { sebelum = 30 }
                    Pilihan("1 jam", sebelum == 60) { sebelum = 60 }
                }
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
                        if (judul.isBlank()) {
                            salah = true
                        } else {
                            val ms = tanggalJam.atZone(zona).toInstant().toEpochMilli()
                            onSimpan(
                                Entri(
                                    id = awal?.id ?: idBaru(),
                                    jenis = jenis,
                                    judul = judul.trim(),
                                    catatan = catatan.trim(),
                                    waktu = ms,
                                    ulang = ulang,
                                    mode = mode,
                                    sebelum = if (jenis == Jenis.JADWAL) sebelum else 0,
                                    aktif = awal?.aktif ?: true
                                )
                            )
                        }
                    }
                    .clip(RoundedCornerShape(50))
                    .background(Brush.horizontalGradient(listOf(utama, kedua)))
                    .padding(vertical = 16.dp),
                textAlign = androidx.compose.ui.text.style.TextAlign.Center
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
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center
                )
            }
        }
    }

    if (dialogTanggal) {
        val st = rememberDatePickerState(
            initialSelectedDateMillis = tanggalJam.toLocalDate()
                .atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli()
        )
        DatePickerDialog(
            onDismissRequest = { dialogTanggal = false },
            confirmButton = {
                Text(
                    "Pilih",
                    color = utama,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier
                        .dapatDitekan {
                            st.selectedDateMillis?.let { ms ->
                                val tgl = Instant.ofEpochMilli(ms).atZone(ZoneOffset.UTC).toLocalDate()
                                tanggalJam = tgl.atTime(tanggalJam.toLocalTime())
                            }
                            dialogTanggal = false
                        }
                        .padding(horizontal = 16.dp, vertical = 10.dp)
                )
            },
            dismissButton = {
                Text(
                    "Batal",
                    color = Slate.s600,
                    modifier = Modifier
                        .dapatDitekan { dialogTanggal = false }
                        .padding(horizontal = 16.dp, vertical = 10.dp)
                )
            }
        ) {
            DatePicker(state = st)
        }
    }

    if (dialogJam) {
        val st = rememberTimePickerState(
            initialHour = tanggalJam.hour,
            initialMinute = tanggalJam.minute,
            is24Hour = true
        )
        androidx.compose.ui.window.Dialog(onDismissRequest = { dialogJam = false }) {
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
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End
                ) {
                    Text(
                        "Batal",
                        color = Slate.s600,
                        modifier = Modifier
                            .dapatDitekan { dialogJam = false }
                            .padding(horizontal = 16.dp, vertical = 10.dp)
                    )
                    Text(
                        "Pilih",
                        color = utama,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier
                            .dapatDitekan {
                                tanggalJam = tanggalJam.withHour(st.hour).withMinute(st.minute)
                                dialogJam = false
                            }
                            .padding(horizontal = 16.dp, vertical = 10.dp)
                    )
                }
            }
        }
    }
}
