# Generated by Django 2.1.1 on 2018-11-25 11:44

import django.contrib.auth.models
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tweets', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='profil_resmi',
            field=models.ImageField(null=True, upload_to='', verbose_name=django.contrib.auth.models.User),
        ),
    ]