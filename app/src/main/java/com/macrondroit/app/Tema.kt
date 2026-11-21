package com.macrondroit.app

import android.content.Context
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/** Satu paket warna tema. Semua tema cerah dan berwarna. */
data class Palet(
    val id: String,
    val nama: String,
    val utama: Color,
    val kedua: Color,
    val latar: Color,
    val teksDiAtasUtama: Color = Color.White
)

val DaftarTema = listOf(
    Palet("mentari", "Mentari", Color(0xFFFF8A00), Color(0xFFFFC83D), Color(0xFFFFF6E5)),
    Palet("samudra", "Samudra", Color(0xFF0288D1), Color(0xFF26C6DA), Color(0xFFE8F7FD)),
    Palet("permen", "Permen", Color(0xFFE91E8C), Color(0xFFB388FF), Color(0xFFFFEEF7)),
    Palet("hutan", "Hutan", Color(0xFF2E9E4F), Color(0xFFB5E04A), Color(0xFFEEF9EA)),
    Palet("lavender", "Lavender", Color(0xFF7E57C2), Color(0xFFF48FB1), Color(0xFFF4EEFB)),
    Palet("semangka", "Semangka", Color(0xFFEF5350), Color(0xFF66BB6A), Color(0xFFFFF0EF))
)

@Composable
fun MacroTema(palet: Palet, isi: @Composable () -> Unit) {
    val skema = lightColorScheme(
        primary = palet.utama,
        onPrimary = palet.teksDiAtasUtama,
        secondary = palet.kedua,
        onSecondary = Color(0xFF2B2B2B),
        background = palet.latar,
        onBackground = Color(0xFF222222),
        surface = Color.White,
        onSurface = Color(0xFF222222),
        primaryContainer = palet.utama.copy(alpha = 0.15f),
        onPrimaryContainer = Color(0xFF222222),
        surfaceVariant = palet.kedua.copy(alpha = 0.2f),
        onSurfaceVariant = Color(0xFF444444)
    )
    val bentuk = Shapes(
        small = RoundedCornerShape(16.dp),
        medium = RoundedCornerShape(24.dp),
        large = RoundedCornerShape(32.dp)
    )
    MaterialTheme(colorScheme = skema, shapes = bentuk, content = isi)
}

/** Menyimpan tema pilihan di HP (tanpa internet). */
class PenyimpanTema(context: Context) {
    private val sp = context.getSharedPreferences("macrondroit", Context.MODE_PRIVATE)

    fun baca(): String = sp.getString("tema", "mentari") ?: "mentari"

    fun simpan(id: String) {
        sp.edit().putString("tema", id).apply()
    }
}
