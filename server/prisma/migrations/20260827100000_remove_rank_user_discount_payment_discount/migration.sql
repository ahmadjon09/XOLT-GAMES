-- Guruh darajasi (rank) va o'quvchining doimiy chegirmasi olib tashlandi;
-- endi chegirma to'lov kiritilganda bir martalik (faqat shu to'lovga) beriladi
ALTER TABLE "Group" DROP COLUMN "rank";
ALTER TABLE "User" DROP COLUMN "discount";

-- To'lovga bir martalik chegirma foizi (0-100)
ALTER TABLE "Payment" ADD COLUMN "discount" INTEGER NOT NULL DEFAULT 0;
