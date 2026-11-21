package com.macrondroit.app

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CalendarMonth
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private fun kelompok(waktu: Long?, hariIni: LocalDate): String {
    if (waktu == null) return "Sudah lewat"
    val tanggal = Instant.ofEpochMilli(waktu).atZone(ZoneId.systemDefault()).toLocalDate()
    return when {
        tanggal == hariIni -> "Hari ini"
        tanggal == hariIni.plusDays(1) -> "Besok"
        else -> "Mendatang"
    }
}

private fun subjudul(e: Entri): String {
    val bagian = mutableListOf<String>()
    bagian += when (e.ulang) {
        Ulang.HARIAN -> "Setiap hari"
        Ulang.MINGGUAN -> "Setiap minggu"
        Ulang.BULANAN -> "Setiap bulan"
        else -> "Sekali"
    }
    bagian += if (e.mode == Mode.ALARM) "Alarm keras" else "Notifikasi"
    if (e.jenis == Jenis.JADWAL && e.sebelum > 0) {
        bagian += "ingatkan ${if (e.sebelum == 60) "1 jam" else "${e.sebelum} mnt"} sebelum"
    }
    return bagian.joinToString(" · ")
}

@Composable
fun PanelDaftar(jenis: Int, pusat: Pusat, onBuka: (Entri) -> Unit) {
    val konteks = LocalContext.current
    val sekarang = System.currentTimeMillis()
    val hariIni = LocalDate.now()
    val baris = pusat.entri
        .filter { it.jenis == jenis }
        .map { it to kejadianBerikut(it, sekarang) }
        .sortedWith(
            compareBy<Pair<Entri, Long?>>({ it.second == null }, { it.second ?: Long.MAX_VALUE })
        )

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 18.dp, bottom = 190.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        if (!pusat.bateraiAman) {
            item(key = "baterai") { KartuBaterai(konteks) }
        }
        if (baris.isEmpty()) {
            item(key = "kosong") {
                if (jenis == Jenis.JADWAL) {
                    KartuKosong(
                        Icons.Rounded.CalendarMonth,
                        "Belum ada jadwal",
                        "Ketuk tombol + di kanan bawah untuk membuat jadwal pertamamu.",
                        "Mulai dari sini"
                    )
                } else {
                    KartuKosong(
                        Icons.Rounded.Notifications,
                        "Belum ada pengingat",
                        "Ketuk tombol + di kanan bawah. Pilih notifikasi biasa atau alarm keras.",
                        "Mulai dari sini"
                    )
                }
            }
        } else {
            var terakhir = ""
            baris.forEach { (e, waktu) ->
                val k = kelompok(waktu, hariIni)
                if (k != terakhir) {
                    terakhir = k
                    item(key = "h_$k") {
                        Text(
                            text = k,
                            style = MaterialTheme.typography.labelLarge,
                            color = Slate.s500,
                            modifier = Modifier.padding(start = 4.dp, top = 6.dp)
                        )
                    }
                }
                item(key = e.id) {
                    KartuEntri(
                        e = e,
                        waktu = waktu,
                        onBuka = { onBuka(e) },
                        onAktif = { pusat.aktifkan(e, it) }
                    )
                }
            }
        }
    }
}

@Composable
private fun KartuEntri(e: Entri, waktu: Long?, onBuka: () -> Unit, onAktif: (Boolean) -> Unit) {
    val utama = MaterialTheme.colorScheme.primary
    val bentuk = RoundedCornerShape(22.dp)
    val zona = ZoneId.systemDefault()
    val tampil = Instant.ofEpochMilli(waktu ?: e.waktu).atZone(zona)
    val jam = remember { DateTimeFormatter.ofPattern("HH:mm") }
    val tanggal = remember { DateTimeFormatter.ofPattern("d MMM", Locale("id", "ID")) }
    val redup = waktu == null || !e.aktif
    val alfa by animateFloatAsState(if (redup) 0.5f else 1f, tween(300), label = "alfa")

    Row(
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
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
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
                text = e.judul,
                style = MaterialTheme.typography.titleMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Spacer(Modifier.height(2.dp))
            Text(
                text = subjudul(e),
                style = MaterialTheme.typography.bodyMedium,
                color = Slate.s500,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
        Spacer(Modifier.width(8.dp))
        Switch(
            checked = e.aktif,
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
}

@Composable
private fun KartuBaterai(konteks: Context) {
    val bentuk = RoundedCornerShape(22.dp)
    val utama = MaterialTheme.colorScheme.primary
    val kedua = MaterialTheme.colorScheme.secondary
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(bentuk)
            .background(Color(0xFFFFF4E0))
            .padding(18.dp)
    ) {
        Text(
            text = "Agar pengingat tepat waktu",
            style = MaterialTheme.typography.titleMedium,
            color = Color(0xFF7A4B00)
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = "Samsung sering menunda aplikasi di latar belakang. Izinkan Macrondroit tanpa batasan baterai.",
            style = MaterialTheme.typography.bodyMedium,
            color = Color(0xFF7A4B00)
        )
        Spacer(Modifier.height(12.dp))
        Text(
            text = "Atur sekarang",
            color = Color.White,
            style = MaterialTheme.typography.labelLarge,
            modifier = Modifier
                .dapatDitekan {
                    try {
                        konteks.startActivity(
                            Intent(
                                Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                                Uri.parse("package:" + konteks.packageName)
                            )
                        )
                    } catch (ex: Exception) {
                        try {
                            konteks.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
                        } catch (ex2: Exception) {
                            // tidak ada layar pengaturan yang cocok
                        }
                    }
                }
                .clip(RoundedCornerShape(50))
                .background(Brush.horizontalGradient(listOf(utama, kedua)))
                .padding(horizontal = 18.dp, vertical = 10.dp)
        )
    }
}
