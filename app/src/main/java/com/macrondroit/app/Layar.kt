package com.macrondroit.app

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Bolt
import androidx.compose.material.icons.rounded.CalendarMonth
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material.icons.rounded.Palette
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

private enum class Tab(val judul: String, val ikon: ImageVector) {
    JADWAL("Jadwal", Icons.Rounded.CalendarMonth),
    PENGINGAT("Pengingat", Icons.Rounded.Notifications),
    OTOMATIS("Otomatis", Icons.Rounded.Bolt),
    TEMA("Tema", Icons.Rounded.Palette)
}

@Composable
fun AplikasiUtama(temaId: String, onPilihTema: (String) -> Unit) {
    var tabAktif by remember { mutableIntStateOf(0) }
    val semuaTab = Tab.values()

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        bottomBar = {
            NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
                semuaTab.forEachIndexed { i, tab ->
                    NavigationBarItem(
                        selected = tabAktif == i,
                        onClick = { tabAktif = i },
                        icon = { Icon(tab.ikon, contentDescription = tab.judul) },
                        label = { Text(tab.judul) }
                    )
                }
            }
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
        ) {
            Kepala()
            when (semuaTab[tabAktif]) {
                Tab.JADWAL -> PanelKosong(
                    Tab.JADWAL.ikon,
                    "Belum ada jadwal",
                    "Di sini nanti kamu bisa membuat jadwal harian, mingguan, dan bulanan.",
                    "Hadir di tahap 2"
                )
                Tab.PENGINGAT -> PanelKosong(
                    Tab.PENGINGAT.ikon,
                    "Belum ada pengingat",
                    "Pilih notifikasi biasa atau alarm keras untuk setiap pengingat.",
                    "Hadir di tahap 2"
                )
                Tab.OTOMATIS -> PanelKosong(
                    Tab.OTOMATIS.ikon,
                    "Belum ada otomatisasi",
                    "Atur aturan: jika waktunya tiba, maka senyapkan HP, mode pesawat, atau buka aplikasi.",
                    "Hadir di tahap 3"
                )
                Tab.TEMA -> PanelTema(temaId, onPilihTema)
            }
        }
    }
}

@Composable
private fun Kepala() {
    val tanggal = remember {
        LocalDate.now().format(DateTimeFormatter.ofPattern("EEEE, d MMMM yyyy", Locale("id", "ID")))
    }
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(bottomStart = 32.dp, bottomEnd = 32.dp))
            .background(
                Brush.horizontalGradient(
                    listOf(MaterialTheme.colorScheme.primary, MaterialTheme.colorScheme.secondary)
                )
            )
            .padding(horizontal = 24.dp, vertical = 28.dp)
    ) {
        Column {
            Text(
                text = stringResource(R.string.app_name),
                color = Color.White,
                fontSize = 26.sp,
                fontWeight = FontWeight.ExtraBold
            )
            Spacer(Modifier.height(4.dp))
            Text(text = tanggal, color = Color.White.copy(alpha = 0.92f), fontSize = 15.sp)
        }
    }
}

@Composable
private fun PanelKosong(ikon: ImageVector, judul: String, keterangan: String, tahap: String) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        contentAlignment = Alignment.Center
    ) {
        Card(
            shape = MaterialTheme.shapes.large,
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(28.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Box(
                    modifier = Modifier
                        .size(72.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.primaryContainer),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        ikon,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(36.dp)
                    )
                }
                Spacer(Modifier.height(16.dp))
                Text(judul, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(8.dp))
                Text(keterangan, textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(16.dp))
                Text(
                    tahap,
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }
    }
}

@Composable
private fun PanelTema(temaId: String, onPilih: (String) -> Unit) {
    Column(modifier = Modifier.fillMaxSize()) {
        Text(
            "Pilih tema",
            modifier = Modifier.padding(start = 24.dp, top = 20.dp, end = 24.dp),
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold
        )
        Text(
            "Warna langsung berubah dan tersimpan di HP.",
            modifier = Modifier.padding(start = 24.dp, end = 24.dp, bottom = 8.dp),
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        LazyVerticalGrid(
            columns = GridCells.Fixed(2),
            modifier = Modifier.fillMaxSize(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            items(DaftarTema) { palet ->
                KartuTema(palet, terpilih = palet.id == temaId, onPilih = { onPilih(palet.id) })
            }
        }
    }
}

@Composable
private fun KartuTema(palet: Palet, terpilih: Boolean, onPilih: () -> Unit) {
    val bentuk = MaterialTheme.shapes.medium
    Card(
        modifier = Modifier
            .clip(bentuk)
            .clickable(onClick = onPilih),
        shape = bentuk,
        colors = CardDefaults.cardColors(containerColor = palet.latar),
        border = if (terpilih) BorderStroke(3.dp, palet.utama) else BorderStroke(1.dp, Color(0x14000000)),
        elevation = CardDefaults.cardElevation(defaultElevation = if (terpilih) 6.dp else 1.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .clip(CircleShape)
                        .background(palet.utama)
                )
                Box(
                    modifier = Modifier
                        .padding(start = 8.dp)
                        .size(24.dp)
                        .clip(CircleShape)
                        .background(palet.kedua)
                )
                Spacer(Modifier.weight(1f))
                if (terpilih) {
                    Icon(Icons.Rounded.Check, contentDescription = "Terpilih", tint = palet.utama)
                }
            }
            Spacer(Modifier.height(14.dp))
            Text(palet.nama, fontSize = 17.sp, fontWeight = FontWeight.Bold, color = Color(0xFF222222))
        }
    }
}
