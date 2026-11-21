package com.macrondroit.app

import android.annotation.SuppressLint
import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/** Memasang dan membatalkan alarm sendiri (tidak memakai aplikasi jam bawaan). */
object Penjadwal {
    private val FLAG = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

    private fun alarmManager(c: Context) = c.getSystemService(Context.ALARM_SERVICE) as AlarmManager

    private fun picu(c: Context, id: Int, tunda: Boolean): PendingIntent {
        val i = Intent(c, AlarmReceiver::class.java)
            .putExtra("id", id)
            .putExtra("tunda", tunda)
        val kode = if (tunda) id + 1_000_000 else id
        return PendingIntent.getBroadcast(c, kode, i, FLAG)
    }

    private fun bukaAplikasi(c: Context): PendingIntent =
        PendingIntent.getActivity(c, 0, Intent(c, MainActivity::class.java), FLAG)

    private fun pasang(c: Context, waktu: Long, p: PendingIntent) {
        // setAlarmClock: paling andal, tidak ditunda mode hemat daya
        alarmManager(c).setAlarmClock(AlarmManager.AlarmClockInfo(waktu, bukaAplikasi(c)), p)
    }

    fun jadwalkan(c: Context, e: Entri) {
        alarmManager(c).cancel(picu(c, e.id, false))
        if (!e.aktif) return
        val waktu = pemicuBerikut(e, System.currentTimeMillis()) ?: return
        pasang(c, waktu, picu(c, e.id, false))
    }

    fun batalkan(c: Context, id: Int) {
        alarmManager(c).cancel(picu(c, id, false))
        alarmManager(c).cancel(picu(c, id, true))
        NotificationManagerCompat.from(c).cancel(id)
    }

    fun tunda(c: Context, id: Int, menit: Int) {
        pasang(c, System.currentTimeMillis() + menit * 60_000L, picu(c, id, true))
    }

    fun jadwalkanSemua(c: Context) {
        Gudang(c).baca().forEach { jadwalkan(c, it) }
        GudangAturan(c).baca().forEach { PenjadwalOtomatis.jadwalkan(c, it) }
    }
}

object Notif {
    const val KANAL_NOTIF = "pengingat_biasa"
    const val KANAL_ALARM = "alarm_keras"
    const val AKSI_TUNDA = "com.macrondroit.app.TUNDA"
    const val AKSI_MATIKAN = "com.macrondroit.app.MATIKAN"

    fun siapkanKanal(c: Context) {
        val nm = c.getSystemService(NotificationManager::class.java)

        val biasa = NotificationChannel(KANAL_NOTIF, "Pengingat", NotificationManager.IMPORTANCE_HIGH)
        biasa.description = "Notifikasi jadwal dan pengingat"
        biasa.enableVibration(true)
        nm.createNotificationChannel(biasa)

        val atribut = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        val keras = NotificationChannel(KANAL_ALARM, "Alarm keras", NotificationManager.IMPORTANCE_HIGH)
        keras.description = "Berbunyi keras sampai dimatikan"
        keras.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM), atribut)
        keras.enableVibration(true)
        keras.vibrationPattern = longArrayOf(0, 600, 400, 600, 400, 600)
        nm.createNotificationChannel(keras)
    }

    @SuppressLint("MissingPermission")
    fun tampilkan(c: Context, e: Entri) {
        val flag = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        val alarm = e.mode == Mode.ALARM

        val buka = PendingIntent.getActivity(c, e.id, Intent(c, MainActivity::class.java), flag)
        val tundaPi = PendingIntent.getBroadcast(
            c, e.id + 2_000_000,
            Intent(c, AksiReceiver::class.java).setAction(AKSI_TUNDA).putExtra("id", e.id),
            flag
        )
        val matikanPi = PendingIntent.getBroadcast(
            c, e.id + 3_000_000,
            Intent(c, AksiReceiver::class.java).setAction(AKSI_MATIKAN).putExtra("id", e.id),
            flag
        )

        val teks = when {
            e.catatan.isNotBlank() -> e.catatan
            e.jenis == Jenis.JADWAL && e.sebelum > 0 -> "Dimulai ${e.sebelum} menit lagi"
            e.jenis == Jenis.JADWAL -> "Jadwal dimulai sekarang"
            else -> "Waktunya pengingat"
        }

        val b = NotificationCompat.Builder(c, if (alarm) KANAL_ALARM else KANAL_NOTIF)
            .setSmallIcon(R.drawable.ic_notif)
            .setContentTitle(e.judul)
            .setContentText(teks)
            .setStyle(NotificationCompat.BigTextStyle().bigText(teks))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(if (alarm) NotificationCompat.CATEGORY_ALARM else NotificationCompat.CATEGORY_REMINDER)
            .setColor(0xFFFF8A00.toInt())
            .setContentIntent(buka)
            .addAction(0, "Tunda 10 menit", tundaPi)

        if (alarm) {
            b.addAction(0, "Matikan", matikanPi)
                .setOngoing(true)
                .setAutoCancel(false)
                .setFullScreenIntent(buka, true)
        } else {
            b.setAutoCancel(true)
        }

        val n = b.build()
        if (alarm) n.flags = n.flags or Notification.FLAG_INSISTENT // bunyi berulang sampai dimatikan
        NotificationManagerCompat.from(c).notify(e.id, n)
    }
}

/** Dipanggil sistem tepat pada waktunya. */
class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getIntExtra("id", -1)
        val tunda = intent.getBooleanExtra("tunda", false)
        val e = Gudang(context).baca().firstOrNull { it.id == id } ?: return
        if (!e.aktif && !tunda) return
        Notif.siapkanKanal(context)
        Notif.tampilkan(context, e)
        if (!tunda) Penjadwal.jadwalkan(context, e) // pasang kejadian berikutnya bila berulang
    }
}

/** Tombol Tunda dan Matikan di notifikasi. */
class AksiReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getIntExtra("id", -1)
        NotificationManagerCompat.from(context).cancel(id)
        if (intent.action == Notif.AKSI_TUNDA) Penjadwal.tunda(context, id, 10)
    }
}

/** Memasang ulang semua alarm setelah HP menyala atau aplikasi diperbarui. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        Penjadwal.jadwalkanSemua(context)
    }
}
