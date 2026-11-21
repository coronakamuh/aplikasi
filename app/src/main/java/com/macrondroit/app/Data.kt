package com.macrondroit.app

import android.content.Context
import android.os.PowerManager
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.temporal.ChronoUnit

object Jenis {
    const val JADWAL = 0
    const val PENGINGAT = 1
}

object Ulang {
    const val TIDAK = 0
    const val HARIAN = 1
    const val MINGGUAN = 2
    const val BULANAN = 3
}

object Mode {
    const val NOTIF = 0
    const val ALARM = 1
}

/** Satu jadwal atau satu pengingat. [waktu] = waktu kejadian pertama (milidetik). */
data class Entri(
    val id: Int,
    val jenis: Int,
    val judul: String,
    val catatan: String,
    val waktu: Long,
    val ulang: Int,
    val mode: Int,
    val sebelum: Int,
    val aktif: Boolean
)

private fun keJson(e: Entri): JSONObject = JSONObject().apply {
    put("id", e.id)
    put("jenis", e.jenis)
    put("judul", e.judul)
    put("catatan", e.catatan)
    put("waktu", e.waktu)
    put("ulang", e.ulang)
    put("mode", e.mode)
    put("sebelum", e.sebelum)
    put("aktif", e.aktif)
}

private fun dariJson(o: JSONObject): Entri = Entri(
    id = o.getInt("id"),
    jenis = o.optInt("jenis", Jenis.JADWAL),
    judul = o.optString("judul", ""),
    catatan = o.optString("catatan", ""),
    waktu = o.getLong("waktu"),
    ulang = o.optInt("ulang", Ulang.TIDAK),
    mode = o.optInt("mode", Mode.NOTIF),
    sebelum = o.optInt("sebelum", 0),
    aktif = o.optBoolean("aktif", true)
)

/** Penyimpanan di HP (tanpa internet, tanpa aplikasi lain). */
class Gudang(context: Context) {
    private val sp = context.applicationContext
        .getSharedPreferences("macrondroit", Context.MODE_PRIVATE)

    fun baca(): List<Entri> {
        val teks = sp.getString("entri", "[]") ?: "[]"
        return try {
            val arr = JSONArray(teks)
            (0 until arr.length()).map { dariJson(arr.getJSONObject(it)) }
        } catch (e: Exception) {
            emptyList()
        }
    }

    fun simpan(daftar: List<Entri>) {
        val arr = JSONArray()
        daftar.forEach { arr.put(keJson(it)) }
        sp.edit().putString("entri", arr.toString()).apply()
    }

    fun idBaru(): Int {
        val n = sp.getInt("id_terakhir", 0) + 1
        sp.edit().putInt("id_terakhir", n).apply()
        return n
    }
}

private fun tambah(awal: ZonedDateTime, ulang: Int, n: Long): ZonedDateTime = when (ulang) {
    Ulang.HARIAN -> awal.plusDays(n)
    Ulang.MINGGUAN -> awal.plusWeeks(n)
    else -> awal.plusMonths(n)
}

/** Kejadian pertama yang waktunya >= [sejak]; null jika sudah lewat dan tidak berulang. */
fun kejadianBerikut(e: Entri, sejak: Long): Long? {
    if (e.waktu >= sejak) return e.waktu
    if (e.ulang == Ulang.TIDAK) return null
    val zona = ZoneId.systemDefault()
    val awal = Instant.ofEpochMilli(e.waktu).atZone(zona)
    val batas = Instant.ofEpochMilli(sejak).atZone(zona)
    var n = when (e.ulang) {
        Ulang.HARIAN -> ChronoUnit.DAYS.between(awal, batas)
        Ulang.MINGGUAN -> ChronoUnit.WEEKS.between(awal, batas)
        else -> ChronoUnit.MONTHS.between(awal, batas)
    }
    if (n < 0) n = 0
    var kandidat = tambah(awal, e.ulang, n)
    while (kandidat.toInstant().toEpochMilli() < sejak) {
        n++
        kandidat = tambah(awal, e.ulang, n)
    }
    return kandidat.toInstant().toEpochMilli()
}

/** Waktu bunyi berikutnya (sudah dikurangi "ingatkan sebelum"). */
fun pemicuBerikut(e: Entri, sekarang: Long): Long? {
    val geser = e.sebelum * 60_000L
    val kejadian = kejadianBerikut(e, sekarang + geser + 1) ?: return null
    return kejadian - geser
}

/** Pusat data untuk tampilan: menyimpan perubahan dan memasang alarm. */
class Pusat(context: Context) {
    private val app = context.applicationContext
    private val gudang = Gudang(app)

    val entri = mutableStateListOf<Entri>().apply { addAll(gudang.baca()) }

    var bateraiAman by mutableStateOf(cekBaterai())
        private set

    private fun cekBaterai(): Boolean {
        val pm = app.getSystemService(Context.POWER_SERVICE) as PowerManager
        return pm.isIgnoringBatteryOptimizations(app.packageName)
    }

    fun segarkan() {
        bateraiAman = cekBaterai()
    }

    fun idBaru(): Int = gudang.idBaru()

    fun simpan(e: Entri) {
        val i = entri.indexOfFirst { it.id == e.id }
        if (i >= 0) entri[i] = e else entri.add(e)
        gudang.simpan(entri.toList())
        Penjadwal.jadwalkan(app, e)
    }

    fun hapus(e: Entri) {
        entri.removeAll { it.id == e.id }
        gudang.simpan(entri.toList())
        Penjadwal.batalkan(app, e.id)
    }

    fun aktifkan(e: Entri, aktif: Boolean) {
        simpan(e.copy(aktif = aktif))
    }
}
