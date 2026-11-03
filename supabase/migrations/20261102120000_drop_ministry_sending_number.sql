-- The second of the two steps in `20261101060000_the_shared_numbers.sql` (Exponential
-- launch, ticket 06). That migration carried every church's number into `shared_number`
-- and `sending_number_assignment`, and kept this column only for the build still serving
-- while it went out. That build is gone, and nothing reads or writes the column now.
--
-- Its check constraint and column grants go with it. `ministry_setup.sending_number`
-- stays: it is the history of what a link issued before the shared numbers named.
alter table ministry drop column sending_number;
