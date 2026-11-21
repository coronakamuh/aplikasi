package com.macrondroit.app

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue

class MainActivity : ComponentActivity() {
    private lateinit var pusat: Pusat

    private val izinNotifikasi =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Layar penuh: header berwarna sampai ke atas, menu melayang di bawah
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.light(
                android.graphics.Color.TRANSPARENT,
                android.graphics.Color.TRANSPARENT
            )
        )

        pusat = Pusat(applicationContext)
        Notif.siapkanKanal(applicationContext)
        Penjadwal.jadwalkanSemua(applicationContext)

        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            izinNotifikasi.launch(Manifest.permission.POST_NOTIFICATIONS)
        }

        val penyimpan = PenyimpanTema(applicationContext)
        setContent {
            var temaId by remember { mutableStateOf(penyimpan.baca()) }
            val palet = DaftarTema.firstOrNull { it.id == temaId } ?: DaftarTema[0]
            MacroTema(palet) {
                AplikasiUtama(
                    pusat = pusat,
                    temaId = temaId,
                    onPilihTema = {
                        temaId = it
                        penyimpan.simpan(it)
                    }
                )
            }
        }
    }

    override fun onResume() {
        super.onResume()
        if (::pusat.isInitialized) pusat.segarkan()
    }
}
