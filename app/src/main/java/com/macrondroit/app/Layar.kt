package com.macrondroit.app

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandHorizontally
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.shrinkHorizontally
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Bolt
import androidx.compose.material.icons.rounded.CalendarMonth
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material.icons.rounded.Palette
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
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

/** Efek tekan: mengecil sedikit lalu memantul kembali, tanpa riak kasar. */
internal fun Modifier.dapatDitekan(onClick: () -> Unit): Modifier = composed {
    val sumber = remember { MutableInteractionSource() }
    val ditekan by sumber.collectIsPressedAsState()
    val skala by animateFloatAsState(
        targetValue = if (ditekan) 0.95f else 1f,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioMediumBouncy,
            stiffness = Spring.StiffnessMedium
        ),
        label = "skala"
    )
    this
        .scale(skala)
        .clickable(interactionSource = sumber, indication = null, onClick = onClick)
}

@Composable
fun AplikasiUtama(pusat: Pusat, temaId: String, onPilihTema: (String) -> Unit) {
    var tabAktif by remember { mutableIntStateOf(0) }
    var formTerbuka by remember { mutableStateOf(false) }
    var formEntri by remember { mutableStateOf<Entri?>(null) }
    var formJenis by remember { mutableIntStateOf(Jenis.JADWAL) }
    var formAturan by remember { mutableStateOf(false) }
    var aturanEdit by remember { mutableStateOf<Aturan?>(null) }

    BackHandler(enabled = formTerbuka || formAturan) {
        formTerbuka = false
        formAturan = false
    }

    fun bukaForm(jenis: Int, entri: Entri?) {
        formJenis = jenis
        formEntri = entri
        formTerbuka = true
    }

    Surface(
        modifier = Modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background,
        contentColor = MaterialTheme.colorScheme.onBackground
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
            Column(modifier = Modifier.fillMaxSize()) {
                Kepala()
                AnimatedContent(
                    targetState = tabAktif,
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth(),
                    transitionSpec = {
                        val arah = if (targetState > initialState) 1 else -1
                        (fadeIn(tween(300)) +
                            slideInHorizontally(tween(350)) { (it * 0.12f).toInt() * arah }) togetherWith
                            (fadeOut(tween(180)) +
                                slideOutHorizontally(tween(350)) { -(it * 0.12f).toInt() * arah })
                    },
                    label = "tab"
                ) { i ->
                    when (Tab.values()[i]) {
                        Tab.JADWAL -> PanelDaftar(Jenis.JADWAL, pusat) { bukaForm(Jenis.JADWAL, it) }
                        Tab.PENGINGAT -> PanelDaftar(Jenis.PENGINGAT, pusat) { bukaForm(Jenis.PENGINGAT, it) }
                        Tab.OTOMATIS -> PanelOtomatis(pusat) {
                            aturanEdit = it
                            formAturan = true
                        }
                        Tab.TEMA -> PanelTema(temaId, onPilihTema)
                    }
                }
            }

            NavMengambang(
                tabAktif = tabAktif,
                onPilih = { tabAktif = it },
                modifier = Modifier.align(Alignment.BottomCenter)
            )

            // Tombol + untuk membuat jadwal atau pengingat baru
            AnimatedVisibility(
                visible = tabAktif in 0..2 && !formTerbuka && !formAturan,
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .navigationBarsPadding()
                    .padding(end = 24.dp, bottom = 108.dp),
                enter = scaleIn(spring(dampingRatio = Spring.DampingRatioMediumBouncy)) + fadeIn(),
                exit = scaleOut() + fadeOut()
            ) {
                TombolTambah {
                    if (tabAktif == 2) {
                        aturanEdit = null
                        formAturan = true
                    } else {
                        bukaForm(if (tabAktif == 0) Jenis.JADWAL else Jenis.PENGINGAT, null)
                    }
                }
            }

            // Formulir tambah/ubah, meluncur dari bawah
            AnimatedVisibility(
                visible = formTerbuka,
                enter = slideInVertically(tween(380)) { it / 3 } + fadeIn(tween(300)),
                exit = slideOutVertically(tween(300)) { it / 3 } + fadeOut(tween(250))
            ) {
                FormEntri(
                    jenis = formJenis,
                    awal = formEntri,
                    idBaru = { pusat.idBaru() },
                    onSimpan = {
                        pusat.simpan(it)
                        formTerbuka = false
                    },
                    onHapus = {
                        pusat.hapus(it)
                        formTerbuka = false
                    },
                    onTutup = { formTerbuka = false }
                )
            }

            // Formulir otomatisasi, meluncur dari bawah
            AnimatedVisibility(
                visible = formAturan,
                enter = slideInVertically(tween(380)) { it / 3 } + fadeIn(tween(300)),
                exit = slideOutVertically(tween(300)) { it / 3 } + fadeOut(tween(250))
            ) {
                FormAturan(
                    awal = aturanEdit,
                    idBaru = { pusat.idBaru() },
                    onSimpan = {
                        pusat.otomasi.simpan(it)
                        formAturan = false
                    },
                    onHapus = {
                        pusat.otomasi.hapus(it)
                        formAturan = false
                    },
                    onTutup = { formAturan = false }
                )
            }
        }
    }
}

@Composable
private fun TombolTambah(onKlik: () -> Unit) {
    val utama = MaterialTheme.colorScheme.primary
    val kedua = MaterialTheme.colorScheme.secondary
    Box(
        modifier = Modifier
            .dapatDitekan(onKlik)
            .shadow(
                elevation = 16.dp,
                shape = CircleShape,
                ambientColor = utama.copy(alpha = 0.35f),
                spotColor = utama.copy(alpha = 0.50f)
            )
            .size(62.dp)
            .clip(CircleShape)
            .background(Brush.linearGradient(listOf(utama, kedua))),
        contentAlignment = Alignment.Center
    ) {
        Icon(
            imageVector = Icons.Rounded.Add,
            contentDescription = "Tambah",
            tint = Color.White,
            modifier = Modifier.size(30.dp)
        )
    }
}

@Composable
private fun Kepala() {
    val tanggal = remember {
        LocalDate.now().format(DateTimeFormatter.ofPattern("EEEE, d MMMM yyyy", Locale("id", "ID")))
    }
    val utama = MaterialTheme.colorScheme.primary
    val kedua = MaterialTheme.colorScheme.secondary

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(bottomStart = 36.dp, bottomEnd = 36.dp))
            .background(Brush.linearGradient(listOf(utama, kedua)))
            .statusBarsPadding()
    ) {
        // Lingkaran hiasan lembut
        Box(
            modifier = Modifier
                .align(Alignment.TopEnd)
                .offset(x = 50.dp, y = (-30).dp)
                .size(180.dp)
                .clip(CircleShape)
                .background(Color.White.copy(alpha = 0.14f))
        )
        Box(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .offset(x = (-40).dp, y = 50.dp)
                .size(130.dp)
                .clip(CircleShape)
                .background(Color.White.copy(alpha = 0.10f))
        )
        Column(
            modifier = Modifier.padding(start = 24.dp, end = 24.dp, top = 20.dp, bottom = 30.dp)
        ) {
            Text(
                text = tanggal,
                color = Color.White,
                style = MaterialTheme.typography.labelMedium,
                modifier = Modifier
                    .clip(RoundedCornerShape(50))
                    .background(Color.White.copy(alpha = 0.22f))
                    .padding(horizontal = 12.dp, vertical = 6.dp)
            )
            Spacer(Modifier.height(16.dp))
            Text(
                text = stringResource(R.string.app_name),
                color = Color.White,
                fontSize = 30.sp,
                fontWeight = FontWeight.ExtraBold,
                letterSpacing = (-0.5).sp
            )
            Spacer(Modifier.height(2.dp))
            Text(
                text = "Atur harimu dengan santai",
                color = Color.White.copy(alpha = 0.92f),
                style = MaterialTheme.typography.bodyMedium
            )
        }
    }
}

@Composable
private fun NavMengambang(tabAktif: Int, onPilih: (Int) -> Unit, modifier: Modifier = Modifier) {
    val bentuk = RoundedCornerShape(32.dp)
    val utama = MaterialTheme.colorScheme.primary
    Row(
        modifier = modifier
            .navigationBarsPadding()
            .padding(horizontal = 20.dp, vertical = 14.dp)
            .fillMaxWidth()
            .shadow(
                elevation = 18.dp,
                shape = bentuk,
                ambientColor = utama.copy(alpha = 0.25f),
                spotColor = utama.copy(alpha = 0.40f)
            )
            .clip(bentuk)
            .background(Color.White)
            .padding(8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Tab.values().forEachIndexed { i, tab ->
            ItemNav(tab, tabAktif == i) { onPilih(i) }
        }
    }
}

@Composable
private fun ItemNav(tab: Tab, aktif: Boolean, onKlik: () -> Unit) {
    val utama = MaterialTheme.colorScheme.primary
    val latarItem by animateColorAsState(
        if (aktif) utama.copy(alpha = 0.14f) else Color.Transparent,
        tween(300),
        label = "latarItem"
    )
    val warnaIkon by animateColorAsState(
        if (aktif) utama else Slate.s400,
        tween(300),
        label = "warnaIkon"
    )
    Row(
        modifier = Modifier
            .dapatDitekan(onKlik)
            .clip(RoundedCornerShape(24.dp))
            .background(latarItem)
            .padding(horizontal = 16.dp, vertical = 12.dp)
            .animateContentSize(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            imageVector = tab.ikon,
            contentDescription = tab.judul,
            tint = warnaIkon,
            modifier = Modifier.size(24.dp)
        )
        AnimatedVisibility(
            visible = aktif,
            enter = fadeIn(tween(250)) + expandHorizontally(),
            exit = fadeOut(tween(150)) + shrinkHorizontally()
        ) {
            Text(
                text = tab.judul,
                color = utama,
                style = MaterialTheme.typography.labelLarge,
                maxLines = 1,
                modifier = Modifier.padding(start = 8.dp)
            )
        }
    }
}

/** Kartu kosong dengan ikon yang berdenyut pelan. Aman dipakai di dalam daftar. */
@Composable
internal fun KartuKosong(ikon: ImageVector, judul: String, keterangan: String, tahap: String) {
    val utama = MaterialTheme.colorScheme.primary
    val kedua = MaterialTheme.colorScheme.secondary
    val bentuk = RoundedCornerShape(28.dp)
    val transisi = rememberInfiniteTransition(label = "napas")
    val denyut by transisi.animateFloat(
        initialValue = 1f,
        targetValue = 1.1f,
        animationSpec = infiniteRepeatable(
            animation = tween(1800, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "denyut"
    )

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .shadow(
                elevation = 14.dp,
                shape = bentuk,
                ambientColor = utama.copy(alpha = 0.20f),
                spotColor = utama.copy(alpha = 0.30f)
            )
            .clip(bentuk)
            .background(Color.White)
            .padding(28.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box(
            modifier = Modifier
                .size(84.dp)
                .scale(denyut)
                .clip(CircleShape)
                .background(
                    Brush.linearGradient(
                        listOf(utama.copy(alpha = 0.22f), kedua.copy(alpha = 0.30f))
                    )
                ),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = ikon,
                contentDescription = null,
                tint = utama,
                modifier = Modifier.size(40.dp)
            )
        }
        Spacer(Modifier.height(22.dp))
        Text(
            text = judul,
            style = MaterialTheme.typography.titleLarge,
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text = keterangan,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(18.dp))
        Text(
            text = tahap,
            style = MaterialTheme.typography.labelLarge,
            color = utama,
            modifier = Modifier
                .clip(RoundedCornerShape(50))
                .background(utama.copy(alpha = 0.12f))
                .padding(horizontal = 14.dp, vertical = 7.dp)
        )
    }
}

@Composable
private fun PanelKosong(ikon: ImageVector, judul: String, keterangan: String, tahap: String) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(start = 24.dp, end = 24.dp, top = 28.dp, bottom = 110.dp),
        contentAlignment = Alignment.TopCenter
    ) {
        KartuKosong(ikon, judul, keterangan, tahap)
    }
}

@Composable
private fun PanelTema(temaId: String, onPilih: (String) -> Unit) {
    Column(modifier = Modifier.fillMaxSize()) {
        Text(
            text = "Pilih tema",
            style = MaterialTheme.typography.titleLarge,
            modifier = Modifier.padding(start = 24.dp, top = 24.dp, end = 24.dp)
        )
        Text(
            text = "Warna berubah mulus dan tersimpan di HP.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(start = 24.dp, top = 2.dp, end = 24.dp)
        )
        LazyVerticalGrid(
            columns = GridCells.Fixed(2),
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 18.dp, bottom = 110.dp),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            items(DaftarTema, key = { it.id }) { palet ->
                KartuTema(palet, terpilih = palet.id == temaId) { onPilih(palet.id) }
            }
        }
    }
}

@Composable
private fun KartuTema(palet: Palet, terpilih: Boolean, onPilih: () -> Unit) {
    val bentuk = RoundedCornerShape(22.dp)
    val elevasi by animateDpAsState(if (terpilih) 14.dp else 3.dp, tween(300), label = "elevasi")
    val tebal by animateDpAsState(if (terpilih) 2.5.dp else 1.dp, tween(300), label = "tebal")
    val warnaGaris by animateColorAsState(
        if (terpilih) palet.utama else Slate.s200,
        tween(300),
        label = "garis"
    )

    Column(
        modifier = Modifier
            .dapatDitekan(onPilih)
            .shadow(
                elevation = elevasi,
                shape = bentuk,
                ambientColor = palet.utama.copy(alpha = 0.25f),
                spotColor = palet.utama.copy(alpha = 0.35f)
            )
            .clip(bentuk)
            .background(Color.White)
            .border(tebal, warnaGaris, bentuk)
            .padding(10.dp)
    ) {
        // Pratinjau mini tampilan tema
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(14.dp))
                .background(palet.latar)
                .padding(10.dp)
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(40.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(Brush.horizontalGradient(listOf(palet.utama, palet.kedua)))
            )
            Spacer(Modifier.height(10.dp))
            Box(
                modifier = Modifier
                    .fillMaxWidth(0.85f)
                    .height(8.dp)
                    .clip(CircleShape)
                    .background(Slate.s200)
            )
            Spacer(Modifier.height(6.dp))
            Box(
                modifier = Modifier
                    .fillMaxWidth(0.55f)
                    .height(8.dp)
                    .clip(CircleShape)
                    .background(Slate.s200)
            )
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 4.dp, end = 4.dp, top = 10.dp, bottom = 2.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = palet.nama,
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.weight(1f)
            )
            AnimatedVisibility(
                visible = terpilih,
                enter = scaleIn(spring(dampingRatio = Spring.DampingRatioMediumBouncy)) + fadeIn(),
                exit = scaleOut() + fadeOut()
            ) {
                Box(
                    modifier = Modifier
                        .size(22.dp)
                        .clip(CircleShape)
                        .background(palet.utama),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Check,
                        contentDescription = "Terpilih",
                        tint = Color.White,
                        modifier = Modifier.size(14.dp)
                    )
                }
            }
        }
    }
}
