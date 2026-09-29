import os

chdir = os.path.dirname(os.path.abspath(__file__))  # so `app:app` and the local imports resolve
bind = "0.0.0.0:" + os.environ.get("PORT", "5000")
workers = 1          # free tier is tiny; threads handle the concurrent I/O
threads = 4
timeout = 120
# Log how long each request took (%(L)s, seconds) so slow endpoints show up in the platform logs.
accesslog = "-"
access_log_format = '%(h)s "%(r)s" %(s)s %(L)ss'
